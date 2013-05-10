
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , util = require('util');

var Logic = require('./logic.js').Logic;
var logic = new Logic();

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(function(req, res, next){
    // make user accesible from view.
    console.log('login user=' + req.session.user);
    res.locals.user = req.session.user;
    next();
  });
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/register', user.showRegisterPage);
app.post('/register', user.register);
app.post('/login', user.login);
app.get('/logout', user.logout);

var server = http.createServer(app);
var io = require('socket.io').listen(server);

io.sockets.on('connection', function(socket) {
  socket.on('startBattle', function(data) {
    logic.startBattle(data.userID, function(err, battleID){
      if(err) {
        socket.emit('news', data.userID + ' failed to start battle. err:' + util.inspect(err));
        return;
      }
      socket.join(battleID);
      io.sockets.in(battleID).emit('news', data.userID + ' started a battle:' + battleID);
      socket.emit('joined', battleID);
    });
  });
  socket.on('joinBattle', function(data) {
    logic.joinBattle(data.userID, data.friendID, function(err, battleID) {
      if(err) {
        socket.emit('news', data.userID + ' failed to join ' + data.friendID + '. err:' + util.inspect(err));
        return;
      }
      socket.join(battleID);
      io.sockets.in(battleID).emit('news', data.userID + ' joined battle:' + battleID);
      socket.emit('joined', battleID);
    });
  });
  socket.on('rejoinBattle', function(data) {
    var battleID = data.battleID;
    socket.join(battleID);
    io.sockets.in(battleID).emit('news', data.userID + ' joined battle:' + battleID);
    socket.emit('joined', battleID);
  });
  socket.on('sendMessage', function(data) {
    io.sockets.in(data.battleID).emit('news', data.userID + ': ' + data.message);
  });
});


server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
