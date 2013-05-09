var driver = require('couchbase');
var config = require('config');

Logic = function(){};

console.log('Connecting to Couchbase.');
driver.connect(config.Couchbase.connection, function(err, cb){
  if(err) throw (err);
  Logic.prototype.cb = cb;
  console.log('Established a connection to Couchbase.');
});

Logic.prototype.registerUser = function(id, password, callback){
  console.log('Registering new user:' + id);
  this.cb.add('User-' + id, {password: password}, function(err, user){
    if(err) {
      callback(err);
      return;
    }
    console.log('err=' + err);
    console.log('user=' + user);
    callback(null, user);
  });
};

Logic.prototype.login = function(id, password, callback){
  this.cb.get('User-' + id, function(err, user){
    if(err) {
      if(err.code == driver.errors.keyNotFound)
        callback(new Error('User not found.'));
      else
        callback(err);
      return;
    }
    if(password !== user.password) {
      callback(new Error('Password unmatch.'));
      return;
    }
    callback(null, user);
  });
};

exports.Logic = Logic;
