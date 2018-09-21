var express = require("express");
var bodyParser = require("body-parser");
var logger = require("morgan");
var mongoose = require("mongoose");
var path = require("path");

// Our scraping tools
// Axios is a promised-based http library, similar to jQuery's Ajax method
// It works on the client and on the server
var request = require("request");
var cheerio = require("cheerio");
var Note = require("./models/Note.js");
var Article = require("./models/Article.js");


var port = process.env.PORT || 3000

// Initialize Express
var app = express();

// Configure middleware

// Use morgan logger for logging requests
app.use(logger("dev"));
// Use body-parser for handling form submissions
app.use(bodyParser.urlencoded({ extended: true }));
// Use express.static to serve the public folder as a static directory
app.use(express.static(path.join(__dirname + '/public')));

// Connect to the Mongo DB
mongoose.connect("mongodb://localhost/mongoscraper");
var db = mongoose.connection;
// Show any mongoose errors
db.on("error", function(error) {
  console.log("Mongoose Error: ", error);
});

// Once logged in to the db through mongoose, log a success message
db.once("open", function() {
  console.log("Mongoose connection successful.");
});
var exphbs = require("express-handlebars");

app.engine("handlebars", exphbs({
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");

app.get("/", function(req, res) {
    Article.find({"saved": false}, function(error, data) {
      var hbsObject = {
        article: data
      };
      console.log(hbsObject);
      res.render("home", hbsObject);
    });
  });
  
  app.get("/saved", function(req, res) {
    Article.find({"saved": true}).populate("notes").exec(function(error, articles) {
      var hbsObject = {
        article: articles
      };
      res.render("saved", hbsObject);
    });
  });
  
  // A GET request to scrape the echojs website
  app.get("/scrape", function(req, res) {
    request("https://www.nytimes.com/section/world", function(error, response, html) {
      var $ = cheerio.load(html);
      var result = {};
      $("article").each(function(i, element) {
        var link = $(element).find("a").attr("href");
        var title = $(element).find("h2.headline").text().trim();
        var summary = $(element).find("p.summary").text().trim();
        result.link = link;
        result.title = title;
        if (summary) {
          result.summary = summary;
        };
        var entry = new Article(result);
        Article.find({title: result.title}, function(err, data) {
          if (data.length === 0) {
            entry.save(function(err, data) {
              if (err) throw err;
            });
          }
        });
      });
      console.log("Scrape finished.");
      res.redirect("/");
    });
  });
  
  // This will get the articles we scraped from the mongoDB
  app.get("/articles", function(req, res) {
    // Grab every doc in the Articles array
    Article.find({}, function(error, doc) {
      // Log any errors
      if (error) {
        console.log(error);
      }
      // Or send the doc to the browser as a json object
      else {
        res.json(doc);
      }
    });
  });
  
  // Grab an article by it's ObjectId
  app.get("/articles/:id", function(req, res) {
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    Article.findOne({ "_id": req.params.id })
    // ..and populate all of the notes associated with it
    .populate("note")
    // now, execute our query
    .exec(function(error, doc) {
      // Log any errors
      if (error) {
        console.log(error);
      }
      // Otherwise, send the doc to the browser as a json object
      else {
        res.json(doc);
      }
    });
  });
  
  
  // Save an article
  app.post("/articles/save/:id", function(req, res) {
        // Use the article id to find and update its saved boolean
        Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true})
        // Execute the above query
        .exec(function(err, doc) {
          // Log any errors
          if (err) {
            console.log(err);
          }
          else {
            // Or send the document to the browser
            res.send(doc);
          }
        });
  });
  
  // Delete an article
  app.post("/articles/delete/:id", function(req, res) {
        // Use the article id to find and update its saved boolean
        Article.findOneAndUpdate({ "_id": req.params.id }, {"saved": false, "notes": []})
        // Execute the above query
        .exec(function(err, doc) {
          // Log any errors
          if (err) {
            console.log(err);
          }
          else {
            // Or send the document to the browser
            res.send(doc);
          }
        });
  });
  
  app.get("/articles/:id", function (req, res) {
    const db = require("./models");
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    db.Article.find({ _id: req.params.id })
        // ..and populate all of the notes associated with it
        .populate({
            path: 'note',
            model: 'Note'
        })
        .then(function (dbArticle) {
            // If we were able to successfully find an Article with the given id, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});
  // Route for saving/updating an Article's associated Note
app.post("/note/:id", function (req, res) {
  const db = require("./models");
  // Create a new note and pass the req.body to the entry
  db.Note.create(req.body)
      .then(function (dbNote) {
          return db.Article.findOneAndUpdate({ _id: req.params.id }, {$push: { note: dbNote._id }}, { new: true });
      })
      .then(function (dbArticle) {
          // If we were able to successfully update an Article, send it back to the client
          res.json(dbArticle);
      })
      .catch(function (err) {
          // If an error occurred, send it to the client
          res.json(err);
      });
});

app.delete("/note/:id", function (req, res) {
  const db = require("./models");
  // Create a new note and pass the req.body to the entry
  db.Note.findByIdAndRemove({ _id: req.params.id })
      .then(function (dbNote) {

          return db.Article.findOneAndUpdate({ note: req.params.id }, { $pullAll: [{ note: req.params.id }]});
      })
      .then(function (dbArticle) {
          // If we were able to successfully update an Article, send it back to the client
          res.json(dbArticle);
      })
      .catch(function (err) {
          // If an error occurred, send it to the client
          res.json(err);
      });
});


  
  // Listen on port
  app.listen(port, function() {
    console.log("App running on port " + port);
  });
  