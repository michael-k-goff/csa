// This is a simple node.js template for ease in getting started.
// this is my comment

/* To-do:
- Add timestamps to orders
- When displaying orders, sort them by timestamp
- Generate the order page using stored product information
- Add share agreement information and basic CSA information to the order page
- Require that the user check the share agreement boxes to place an order
- On the product admin page, allow the terms of the share agreement and basic CSA information to be editted
*/

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
var users;	// The users collection.  For now, users and administrators are equivalent
var orders;	// The collection of all orders in the system
var info_object;	// A collection with a single document containing all CSA info
var database;
var mongodb = require('mongodb')
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
	db.createCollection('info_object', function(err,collection) {
		info_object = db.collection('info_object');
		collection.findOne({}, function(err,item) {
			csa_info = item;
			if (!csa_info) {csa_info = DefaultCSAInfo();}
		});
	});
});

var csa_info = {}; // Mirrors the object in the database.

// Compile the jade templates
var fn = jade.compile(fs.readFileSync("index.jade"));
var adminfn = jade.compile(fs.readFileSync("admin.jade"));
var vofn = jade.compile(fs.readFileSync("vieworders.jade"));
var editfn = jade.compile(fs.readFileSync("editinfo.jade"));

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

app.get('/', function(request, response) { // The main page
	response.send(fn({user:request.user, info: csa_info}));
});

app.get('/admin', function(request,response) { // Main page for the admin panel
	response.send(adminfn({user:request.user}));
});

// View all orders with some administrative options
app.get('/vieworders', function(request,response) {
	orders.find().toArray(function(err,items) {
		response.send(vofn({user:request.user, orders: items}));
	});
});

app.get('/clearorders', function(request,response) { // Clear all orders from the system
	if (!request.user) {response.redirect('/')}
	else {
		orders.remove({}, function(err) {response.redirect('/admin')});
	}
});

function DefaultCSAInfo() { // If no CSA description object is in the database, create a default one.
	return {Products: [
		{name:'product1',desc:'Description 1',price:'50.00',admin_fee:'6.00',max_num:1},
		{name:'product2',desc:'Description 2',price:'100.00',admin_fee:'12.00',max_num:2},
		{name:'product3',desc:'Description 3',price:'150.00',admin_fee:'18.00',max_num:3}
		],
		Agreements: ["Term 1", "Term 2", "Term 3"],
		Title: "Peaceful Rest Valley CSA",
		Description: "Description of the CSA"};
}

app.get('/editinfo', function(request,response) { // Edit information about the CSA
	response.send(editfn({user:request.user, csa_info: csa_info}));
});

app.post('/new_product', function(request,response) { // Add a new product from the admin panel
	csa_info.Products.push(request.body);
	info_object.remove({}, function(err) {
		info_object.insert(csa_info, {w:1}, function(err,result) {
			response.redirect('/editinfo');
		});
	});
});

app.post('/update_product', function(request,response) { // Update an existing product from the admin panel
	var num = request.body.product_num;
	csa_info.Products[num] = request.body;
	info_object.remove({}, function(err) {
		info_object.insert(csa_info, {w:1}, function(err,result) {
			response.redirect('/editinfo');
		});
	});
});

app.post('/delete_product', function(request, response) { // Delete a product from the admin panel
	var num = request.body.product_num;
	csa_info.Products.splice(num,1);
	info_object.remove({}, function(err) {
		info_object.insert(csa_info, {w:1}, function(err,result) {
			response.redirect('/editinfo');
		});
	});
});

app.post('/deleteorder',function(request,response) { // Delete a single order from the system
	console.log("Removing order with id " + request.body.id);
	orders.remove({"_id":new mongodb.ObjectID(request.body.id)},function(err) {
		response.redirect('/vieworders');
	});
});

// Administrative log in
app.post('/login', passport.authenticate('local', { failureRedirect: '/', failureFlash: true }), function(req, res) {
	res.redirect('/admin');
});

// Note: as it is now, anyone can register an account and gain administrative privileges.
// This is the case for testing purposes and must be changed before deployment
app.post('/register', function(req, res) { // Register an admin account.  All admins use the same data
	var new_user = {'username':req.body.username, 'password':req.body.password};
	users.insert(new_user, {w:1},function(err,result) {});
	res.redirect('/');
});

app.post('/logout', function(request,response) {request.logout(); response.redirect('/');}) // Administrative log out

app.post('/placeorder', function(request,response) { // This request is invoked when the user places an order
	// Extract key personal parameters from the order text
	var order = {firstname: request.body.firstname, lastname: request.body.lastname, email: request.body.email, phone: request.body.phone, order:{}};
	// Extract the parameters from the orders themselves
	for (key in request.body) {
		if (!(key in order)) {order.order[key] = request.body[key];}
	}
	// Create an order string for display purposes
	order_texts = []
	for (key in order.order) {
		if (parseInt(order.order[key]) > 0) {order_texts.push(order.order[key] + " X " + key);}
	}
	order.text = order_texts.join(", ");
	
	console.log(order); // Log the order, as it will be stored in the database, to the console.  Use for debugging
	orders.insert(order, {w:1}, function(err,res) {
		response.send("<b>Order Placed</b><br><a href='/'>Home</a>"); // A minimal order confirmation page
	})
});

// Fire the app up
var port = process.env.PORT || 8080;
app.listen(port, function() {
	console.log("Listening on " + port);
});
