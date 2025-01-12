var express = require("express");
var config = require('config');
var bodyParser = require("body-parser");
var session = require('express-session');
var morgan = require('morgan');
var app = express();
var flash = require("connect-flash");
var passport = require('passport');
var createError = require('http-errors');
var hbs_sections = require('express-handlebars-sections');


app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(session({
    secret: 'secret_key',
    resave: true,
    saveUninitialized: true
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) =>{
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});


//static folder
app.use(express.static(__dirname + "/public"));

//set up engine 
app.set("views", __dirname + "/apps/views")
app.set("view engine", "handlebars");

var handlebars = require("express-handlebars").create({
    defaultLayout: 'index',
    layoutsDir: __dirname + "/apps/views",
    helpers: {
        section: hbs_sections()
    }
});

app.engine('handlebars', handlebars.engine);

//set moment helper for handlebars
var Handlebars = require("handlebars");
var MomentHandler = require("handlebars.moment");
MomentHandler.registerHelpers(Handlebars);

var controllers = require(__dirname + "/apps/controllers");
app.use(controllers);

app.use((req, res, next) => {
    next(createError(404));
})

app.use((err, req, res, next) => {
    var status = err.status || 500; 
    var errorView = '500';
    if (status === 400)
        errorView = 400;
    else if (status === 404)
        errorView = '404';
    else if (status === 401) 
        errorView = '401';
    else if (status === 403) 
        errorView = '403';
    else if (status === 404)
        errorView = '404';
    else if (status === 503)
        errorView == 503;

    var msg = err.message;
    var error = err;
    res.status(status).render(errorView, {
        layout: false, 
        msg, 
        error
    })
})

var port = 3000;

app.listen(process.env.PORT || port, function(){
    console.log("Server is running on port: ", port);
});


  