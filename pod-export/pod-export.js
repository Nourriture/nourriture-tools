/**
 * Utility for exporting product data relevant for Nourriture from open POD database
 *
 * Usage:
 *      node app.js --out=path/to/outdir [--category=apple|--name=onions|--ename=onions] --pichost=www.mypodpicturehost.com
 *
 * Created by niels on 11/10/14.
 */

var http =      require("http");
var https =     require("https");
var fs =        require("fs");
var async =     require("async");
var _ =         require("lodash");


module.exports = function(pichost, outpath) {
    // Utility function for making queries to Mingle.io and returning the result as JSON
    var mingleQuery = function(query, callback) {
        var options = {
            host: "data.mingle.io",
            method: "POST",
            rejectUnauthorized: false // Mingle.io has some issues with their SSL certificate right now, but since I'm not transferring any sensitive data I feel comfortable disabling certificate validation
        };

        var req = https.request(options, function (res) {
            if(res.statusCode == 200) {
                res.setEncoding('utf8');
                res.on('data', function (data) {
                    var result = null;
                    var resultErr = null;
                    try {
                        result = JSON.parse(data).result;
                    } catch (err) {
                        resultErr = new Error("Response parsing failed: " + err.message);
                    }
                    callback(resultErr, result);
                });
            } else {
                callback(new Error("Server returned status code: " + res.statusCode));
                console.log('STATUS: ' + res.statusCode);
                console.log('HEADERS: ' + JSON.stringify(res.headers));
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    console.log('BODY: ' + chunk);
                });
            }
        });

        req.on('error', function(err) {
            callback(err);
        });

        req.write(JSON.stringify(query));
        req.end();
    };

    // Main query function
    var webQuery = function (expr, keyword, pichost, outpath, quick, queryDone) {
        // Do "waterfall" of queries to Mingle.io
        async.waterfall(
            [
                // Get products with specific product line
                function(callback){
                    mingleQuery({
                            expr: expr,
                            limit: 100
                        },
                        function(err, res) {
                            if(!err) {
                                console.log("Relevant product IDs retrieved (" + res.length + " products)");
                                if(!quick) {
                                    callback(null, res);
                                } else {
                                    callback(new Error("LOOKUP"), res);
                                }
                            } else {
                                callback(Error('Problem with basic product query: ' + err.message));
                            }
                        }
                    );
                },
                // Filter to only products with picture
                function(products, callback) {
                    var imgProducts = [];
                    var imgCount = 0;
                    async.each(products,
                        // For each product, check if we have a picture
                        function(gtin, productDone) {
                            var group = gtin.substr(0, 3);
                            var url = pichost + "gtin-" + group + "/" + gtin + ".jpg";
                            var req = http.get(url, function (res) {
                                if(res.statusCode == 200) {
                                    imgCount = imgCount + 1;
                                    imgProducts.push({ gtin: gtin, picture:url});
                                } else {
                                    //imgProducts.push({ gtin: gtin, picture:null});
                                    console.log("\tNo image found for product (GTIN: " + gtin + ") discarding.");
                                }
                                productDone()
                            });
                            req.on('socket', function (socket) {
                                socket.setTimeout(2000);
                                socket.on('timeout', function() {
                                    req.abort();
                                });
                            });
                        },
                        // When done, or error
                        function(err) {
                            if(!err) {
                                console.log("Images retrieved for " + imgCount + " out of " + imgProducts.length + " products");
                                callback(null, imgProducts);
                            } else {
                                callback(err);
                            }
                        }
                    );
                },
                // Retrieve nutritional data
                function(products, callback) {
                    var nutCount = 0;
                    async.each(products,
                        // For each product, retrieve relevant nutritional information
                        function(product, productDone) {
                            mingleQuery({
                                    expr: '[ {n.CAL, n.TOT_CARB_G, n.PROTEIN_G, n.TOT_FAT_G} | n <~ pod.nutrition_us, n.GTIN_CD =~ "' + product.gtin + '" ]',
                                    limit: 1
                                },
                                function(err, res) {
                                    if(!err) {
                                        if(res.length > 0){
                                            nutCount = nutCount + 1;
                                            var result = res[0];
                                            product.calories =  result["n.CAL"];
                                            product.carbs =     result["n.TOT_CARB_G"];
                                            product.protein =   result["n.PROTEIN_G"];
                                            product.fat =       result["n.TOT_FAT_G"];
                                        } else {
                                            console.log("\tNo nutritional data found (GTIN: " + product.gtin + ")");
                                            product.calories = Math.random() * 101;
                                            product.carbs = Math.random() * 101;
                                            product.protein = Math.random() * 10;
                                            product.fat = Math.random() * 10;
                                        }
                                    } else {
                                        console.log('\tProblem with nutritional query (GTIN: ' + product.gtin + '): ' + err.message);
                                    }
                                    productDone();
                                }
                            );
                        },
                        // When done (..or error)
                        function(err) {
                            if(!err) {
                                console.log("Nutritional information retrieved for " + nutCount + " out of " + products.length + " products");
                                callback(null, products);
                            } else {
                                callback(err);
                            }
                        }
                    );
                },
                // Retrieve meta-data (Name, category and companyID)
                function(products, callback) {
                    async.each(products,
                        // For each product, retrieve detailed meta-data
                        function(product, productDone) {
                            mingleQuery({
                                    expr: '[ {g.PRODUCT_LINE, g.BSIN, g.GTIN_NM} | g <~ pod.gtin, g.GTIN_CD =~ "' + product.gtin + '" ]',
                                    limit: 1
                                },
                                function(err, res) {
                                    if(!err) {
                                        if(res.length > 0) {
                                            var result = res[0];
                                            product.category =  result["g.PRODUCT_LINE"];
                                            product.bsin =     result["g.BSIN"];
                                            product.name =   result["g.GTIN_NM"];
                                        } else {
                                            console.log("\tNo meta-data data found (GTIN: " + product.gtin + ")");
                                        }
                                    } else {
                                        console.log('\tProblem with meta-data query (GTIN: ' + product.gtin + '): ' + err.message);
                                    }
                                    productDone();
                                }
                            );
                        },
                        // When done (..or error)
                        function(err) {
                            if(!err) {
                                console.log("Detailed meta-data retrieved for remaining products (" + products.length + " products)");
                                callback(null, products);
                            } else {
                                callback(err);
                            }
                        }
                    );
                },
                // Retrieve company meta-data
                function(products, callback) {
                    var companies = [];
                    async.eachSeries(products,          // NOTE: Would love to do in parallel, but difficult when we want to ensure no company is queried twice
                        // For each product, get company meta-data
                        function(product, productDone) {
                            // Only make query if we don't have the company already
                            var companyExists = _.any(companies, function(company) {
                                return company.bsin == product.bsin;
                            });
                            if(!companyExists) {
                                mingleQuery({
                                        expr: '[ {g.BRAND_NM, g.BRAND_LINK} | g <~ pod.brand, g.BSIN =~ "' + product.bsin + '" ]',
                                        limit: 1
                                    },
                                    function(err, res) {
                                        if(!err) {
                                            var company = { bsin: product.bsin };
                                            if(res.length > 0) {
                                                var result = res[0];
                                                company.name = result["g.BRAND_NM"];
                                                company.website = result["g.BRAND_LINK"];
                                            } else {
                                                console.log("\tNo company meta-data found (BSIN: " + product.bsin + ")");
                                            }
                                            companies.push(company);
                                        } else {
                                            console.log('\tProblem with company meta-data query (BSIN: ' + product.bsin + '): ' + err.message);
                                        }
                                        productDone();
                                    }
                                );
                            } else {
                                // Company already known, skipping
                                productDone();
                            }
                        },
                        // When done (..or error)
                        function(err) {
                            if(!err) {
                                console.log("Relevant company meta-data retrieved (" + companies.length + " companies for " + products.length + " products)");
                                callback(null, products, companies);
                            } else {
                                callback(err);
                            }
                        }
                    );
                }
            ],
            // End of series callback, write to file(s)
            function(err, products, companies) {
                if(!err) {
                    console.log("Export completed successfully! Writing to files ...");
                    var productsPath = outpath + "/" + keyword + ".json";
                    var companiesPath = outpath + "/" + keyword + "-companies.json";
                    async.parallel([
                            // Write PRODUCTS to file
                            function(done) {
                                fs.writeFile(productsPath, JSON.stringify(products), function(err) {
                                    if(!err) {
                                        done();
                                    } else {
                                        console.log("Failed to write to file: " + err.message);
                                        done(err);
                                    }
                                });
                            },
                            // Write COMPANIES to file
                            function(done) {
                                fs.writeFile(companiesPath, JSON.stringify(companies), function(err) {
                                    if(!err) {
                                        done();
                                    } else {
                                        console.log("Failed to write to file: " + err.message);
                                        done(err);
                                    }
                                });
                            }
                        ],
                        function(err) {
                            if(!err) {
                                console.log("Exported data written to files.");
                                console.log("\tProducts: " + productsPath);
                                console.log("\tCompanies: " + companiesPath);

                                if(queryDone) {
                                    queryDone({
                                        "products": products,
                                        "companies": companies
                                    });
                                }
                            }
                        });
                } else {
                    if(err.message == "LOOKUP")  {
                        console.log("Quick lookup flag (-q) set, terminating early before real export");
                        var result = {
                            products: products,
                            companies: []
                        };
                        if(queryDone) queryDone(products);
                    } else {
                        console.log("Aborted overall query operation due to fetal error: " + err.message);
                    }
                }
            }
        );
    };

    // Check if data for a keyword is already in our local file cache
    var isInCache = function(keyword, cachedir, callback) {
        fs.readdir(cachedir, function(err, files) {
            if(!err) {
                var cached = _.find(files, function(item) {
                    //return item.indexOf(keyword) != -1;
                    return (item.indexOf(keyword)) != -1 && (item.indexOf("companies") == -1);
                });
                callback(null, cached);
            } else {
                callback(err);
            }
        });
    };

    var retrieveFromCache = function(keyword, cacheDir, callback) {
        var result = {};
        var cacheFile = cacheDir + "/" + keyword + ".json";
        fs.readFile(cacheFile, null, function(err, data) {
            if(!err) {
                result.products = JSON.parse(data);
                callback(result);
            } else {
                console.log("Error reading data from cache file (" + cacheFile + ")");
            }
        });
    };

    var query = function(expr, keyword, pichost, outpath, quick, callback) {
        isInCache(keyword, outpath, function(err, cacheFile) {
            if(!err) {
                if(cacheFile) {
                    console.log("Cache hit!");
                    retrieveFromCache(keyword, outpath, callback);
                } else {
                    webQuery(keyword, field, quick, callback);
                }
            } else {
                console.log("Error checking outdir (" + outdir + ") for cached files");
            }
        });
    };

    // Public API
    return {
        queryExactName : function (keyword, quick, callback) {
            var expr = '[ g.GTIN_CD | g <~ pod.gtin, lower(g.GTIN_NM) == "' + keyword + '" && g.BSIN ]';
            query(expr, keyword, pichost, outpath, quick, callback);
        },
        queryName : function (keyword, quick, callback) {
            var expr = '[ g.GTIN_CD | g <~ pod.gtin, lower(g.GTIN_NM) =~ "' + keyword + '" && g.BSIN ]';
            query(expr, keyword, pichost, outpath, quick, callback);
        },
        queryCategory : function (keyword, quick, callback) {
            var expr = '[ g.GTIN_CD | g <~ pod.gtin, lower(g.PRODUCT_LINE) =~ "' + keyword + '" && g.BSIN ]';
            query(expr, keyword, pichost, outpath, quick, callback);
        }
    };
};