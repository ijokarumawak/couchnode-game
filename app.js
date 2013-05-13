
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
    console.log('login user=' + req.session.user);
    if(req.session.user) {
      // use the latest data in the couchbase.
      logic.getUser(req.session.user.id, function(err, user){
        if(err) {
          res.send(500, util.inspect(err));
          return;
        };
        req.session.user = user;
        console.log('got the latest user data:' + JSON.stringify(user));
        // make user accesible from view.
        res.locals.user = user;
        next();
      });
    } else {
      next();
    }
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
    logic.startBattle(data.userID, function(err, battle){
      if(err) {
        socket.emit('news', data.userID + ' failed to start battle. err:' + util.inspect(err));
        return;
      }
      if(data.oldBattleID) socket.leave(data.oldBattleID);
      socket.join(battle.id);
      io.sockets.in(battle.id).emit('news', data.userID + ' started a battle:' + battle.id);
      io.sockets.in(battle.id).emit('updateBattle', battle);
    });
  });
  socket.on('joinBattle', function(data) {
    logic.joinBattle(data.userID, data.friendID, function(err, battle) {
      if(err) {
        socket.emit('news', data.userID + ' failed to join ' + data.friendID + '. err:' + util.inspect(err));
        return;
      }
      if(data.oldBattleID) socket.leave(data.oldBattleID);
      socket.join(battle.id);
      io.sockets.in(battle.id).emit('news',
        data.userID + ' joined battle:' + battle.id);
      io.sockets.in(battle.id).emit('updateBattle', battle);
    });
  });
  socket.on('rejoinBattle', function(data) {
    var battleID = data.battleID;
    logic.rejoinBattle(data.userID, battleID, function(err, battle){
      if(err){
        socket.emit('news', data.userID + ' failed to join ' + battleID + '. err:' + util.inspect(err));
        return;
      }
      socket.join(battle.id);
      io.sockets.in(battle.id).emit('news', data.userID + ' rejoined battle:' + battleID);
      io.sockets.in(battle.id).emit('updateBattle', battle);
    });
  });
  socket.on('attack', function(data){
    logic.attack(data, function(err, battle, messages){
      if(err){
        socket.emit('news', data.attackerID + ' failed to attack '
          + data.attackeeID + '. err:' + util.inspect(err));
        return;
      }
      // the battle has finished already.
      if(battle.result) return;

      io.sockets.in(battle.id).emit('news', messages);
      logic.checkBattleState(battle, function(err, battle, messages){
        io.sockets.in(battle.id).emit('updateBattle', battle);
        io.sockets.in(battle.id).emit('news', messages);
      });
    });
  });
  socket.on('sendMessage', function(data) {
    console.log('### rooms=' + JSON.stringify(io.sockets.manager.rooms));
    io.sockets.in(data.battleID).emit('news', data.userID + ': ' + data.message);
  });
});


server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
