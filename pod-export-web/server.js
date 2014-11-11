/**
 * Created by niels on 11/11/14.
 */

var express = require("express");

var app = express();
app.use(express.static(__dirname + "/static")); 	// Static content


app.get("/search/name/:name", function(req, res) {
    console.log("Search request received!");
    res.send("Hello!")
});


server = app.listen(8080, function() {
    console.log("Listening on port %d", server.address().port);
});