// This is a simple node.js template for ease in getting started.
// this is my comment

var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var sys = require("sys"), fs = require("fs");
var flash = require('connect-flash');
var jade = require('jade');
passport = require("passport");
LocalStrategy = require('passport-local').Strategy;

// Set up the MongoDB connection
var users;
var orders;
var database;
var MongoClient = require('mongodb').MongoClient;
MongoClient.connect("mongodb://localhost:27017/csa", function(err, db) {
    if(!err) {
        console.log("We are connected");
    }
    else {console.log("Problem connecting to database");return;}
	database = db;
	db.createCollection('users', function(err, collection) {
		users = db.collection('users');
	});
	db.createCollection('orders', function(err, collection) {
		orders = db.collection('orders');
	});
});

// A user for testing purposes
var test_usernames = ["alice","bob","charlie"];
var test_passwords = ["12345","qwerty","asdf"];

// Set up the index page
var fn = jade.compile(fs.readFileSync("index.jade"));

var app = express();

app.use(bodyParser());
app.use(cookieParser());
app.use(session({ secret: 'SECRET' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Manage log-in.  Should be rewritten later to check names against a database.
passport.serializeUser(function(user, done) {
	done(null, user);
});
passport.deserializeUser(function(user, done) {
	users.findOne({'username':user}, function(err,item) {
		done(null,item.username);
	});
});
passport.use(new LocalStrategy(
	function(username, password, done) {
		users.findOne({'username':username}, function(err,item) {
			if (!item) {
				return done(null, false, { message: 'Incorrect username.' });
			}
			if (password != item.password) {
				return done(null, false, { message: 'Incorrect password.' });
			}
			return done(null, username);
		});
	}
));

app.get('/', function(request, response) {
	response.send(fn({orders: ['a','b','c'],
					  user:request.user}));
});

app.get('/vieworders', function(request,response) {
	orders.find().toArray(function(err,items) {
		response.send(JSON.stringify(items));
	});
});

app.post('/login', passport.authenticate('local', { failureRedirect: '/', failureFlash: true }), function(req, res) {
	res.redirect('/');
//	res.send("Logged in<br><a href='/'>Home</a>");
});
app.post('/register', function(req, res) {
	var new_user = {'username':req.body.username, 'password':req.body.password};
	users.insert(new_user, {w:1},function(err,result) {});
	res.redirect('/');
});
app.post('/logout', function(request,response) {request.logout(); response.redirect('/');})

app.post('/placeorder', function(request,response) {
	var order = {firstname: request.body.firstname, lastname: request.body.lastname, share: request.body.share};
	// var order = request.body;
	orders.insert(order, {w:1}, function(err,response) {})
	response.send("<b>Order Placed</b>");
});

var port = process.env.PORT || 8080;
app.listen(port, function() {
	console.log("Listening on " + port);
});
