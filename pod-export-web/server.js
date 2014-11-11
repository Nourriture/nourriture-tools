/**
 * Created by niels on 11/11/14.
 */

var express = require("express");
var fs = require("fs");

var app = express();
app.use(express.static(__dirname + "/static")); 	// Static content
app.use(express.static(__dirname + "/node_modules/knockout/build/output"));
app.use(express.static(__dirname + "/node_modules/jquery/dist"));

var pichost = "http://9la.dk/img/product/";
var outdir = "../pod-export/output";
var podExport = require("../pod-export/pod-export")(pichost, outdir);

// Check if data for a keyword is already in our local file cache
var isInFileCache = function(keyword) {
    //fs.readdir...
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

    // TODO: Serve from file cache instead, if already there (In respect for community limits on POD, we should try to minimize number of queries)

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

});


server = app.listen(8080, function() {
    console.log("Listening on port %d", server.address().port);
});