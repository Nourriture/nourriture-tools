/**
 * Created by niels on 11/11/14.
 */

var express = require("express");
var fs = require("fs");
var _ = require("lodash");

var app = express();
app.use(express.static(__dirname + "/static")); 	// Static content
app.use(express.static(__dirname + "/node_modules/knockout/build/output"));
app.use(express.static(__dirname + "/node_modules/jquery/dist"));

var pichost = "http://9la.dk/img/product/";
var outdir = "../pod-export/output";
var podExport = require("../pod-export/pod-export")(pichost, outdir);

// Check if data for a keyword is already in our local file cache
var isInFileCache = function(keyword, callback) {
    fs.readdir(outdir, function(err, files) {
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

var exportFromPod = function(keyword, field, quick, res) {
    var respond = function (result) {
        if(quick) {
            res.send(result);
        } else {
            res.send(result.products);
        }
        res.end();
    };

    switch(field) {
        case "category":
            podExport.queryCategory(keyword, quick, respond);
            break;
        case "ename":
            podExport.queryExactName(keyword, quick, respond);
            break;
        case "name":
            podExport.queryName(keyword, quick, respond);
            break;
    }
};

//       /search/category/onions?quick=true
app.get("/search/:field/:name", function(req, res) {
    console.log("Search request received!");
    var keyword = req.params["name"];
    var field = req.params["field"];
    var quick = false;

    if(req.query["quick"]) {
        var quick = JSON.parse(req.query["quick"]);
    }

    isInFileCache(keyword, function(err, cacheFile) {
        if(!err) {
            if(cacheFile) {
                console.log("Cache hit!");
                fs.readFile(outdir + "/" + cacheFile, null, function(err, data) {
                    if(!err) {
                        res.set("Content-Type", "json/application");
                        res.send(data);
                        res.end();
                    } else {
                        console.log("Error reading data from cache file (" + cacheFile + ")");
                    }
                });
            } else {
                exportFromPod(keyword, field, quick, res);
            }
        } else {
            console.log("Error checking outdir (" + outdir + ") for cached files");
        }
    });
});


server = app.listen(8080, function() {
    console.log("Listening on port %d", server.address().port);
});