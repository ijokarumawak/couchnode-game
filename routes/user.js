var Logic = require('../logic.js').Logic;
var logic = new Logic();
var util = require('util');

exports.showRegisterPage = function(req, res){
  res.render('register', { title: 'Register new user' });
};

exports.register = function(req, res){
  var id = req.param('id');
  var password = req.param('password');
  if(!id || !password) {
    res.send(400, 'ID and password are required.');
    return;
  }
  logic.registerUser(id, password, function(err, user){
    if(err) {
      res.send(500, util.inspect(err));
      return;
    };
    res.redirect('/');
  });
};

exports.login = function(req, res){
  var id = req.param('id');
  var password = req.param('password');
  if(!id || !password) {
    res.send(400, 'ID and password are required.');
    return;
  }
  logic.login(id, password, function(err, user){
    if(err) {
      res.send(500, util.inspect(err));
      return;
    };
    res.redirect('/');
  });
};
