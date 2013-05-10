var driver = require('couchbase');
var config = require('config');
var cb;

Logic = function(){};

// Syntax sugar.
function isErr(err, callback){
  if(err) {
    callback(err);
    return true;
  }
  return false;
}

console.log('Connecting to Couchbase.');
driver.connect(config.Couchbase.connection, function(err, _cb){
  if(err) throw (err);
  cb = _cb;
  console.log('Established a connection to Couchbase.');
});

Logic.prototype.registerUser = function(id, password, callback){
  console.log('Registering new user:' + id);
  cb.add('User-' + id, {password: password}, function(err, user){
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
  cb.get('User-' + id, function(err, user){
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
    user.id = id;
    callback(null, user);
  });
};

Logic.prototype.startBattle = function(userID, callback) {
  var battle = {users: [userID]};
  var battleID = 'Battle-' + userID + '-' + new Date().getTime();
  cb.add(battleID, battle, function(err, battle){
    if(isErr(err, callback)) return;
    console.log('Battle has started:' + JSON.stringify(battle));

    cb.get('User-' + userID, function(err, user){
      if(isErr(err, callback)) return;
      console.log('Updating user.');
      user.battleID = battleID;

      cb.set('User-' + userID, user, function(err, user){
        if(isErr(err, callback)) return;
        callback(null, battleID);
      });
    });
  });
};

Logic.prototype.joinBattle = function(userID, friendID, callback) {
  cb.get('User-' + friendID, function(err, friend) {
    if(isErr(err, callback)) return;
    console.log(userID + ' got friend:' + JSON.stringify(friend));
    if(typeof(friend.battleID) === 'undefined') {
      callback(new Error(friendID + ' is not fighting.'));
      return;
    }
    var battleID = friend.battleID;

    cb.get(battleID, function(err, battle){
      if(isErr(err, callback)) return;
      battle.users.push(userID);
      console.log('Updating battle:' + JSON.stringify(battle));

      cb.set(battleID, battle, function(err) {
        if(isErr(err, callback)) return;

        cb.get('User-' + userID, function(err, user){
          if(isErr(err, callback)) return;
          user.battleID = battleID;

          cb.set('User-' + userID, user, function(err){
            if(isErr(err, callback)) return;
            callback(null, battleID);
          });
        });
      });
    });
  });
};

Logic.prototype.leaveBattle = function(userID, callback) {
  cb.get('User-' + userID, function(err, user){
    if(isErr(err, callback)) return;
    delete user.battleID;
    cb.set('User-' + userID, user, function(err){
      callback(err);
    });
  });
};

exports.Logic = Logic;
