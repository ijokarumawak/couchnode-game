var driver = require('couchbase');
var config = require('config');
var util = require('util');
var async = require('async');
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
  var user = {type: 'User', id: id, password: password,
    level: 1, hp: 100, atk: 10}
  cb.add('User-' + id, user, function(err){
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

Logic.prototype.getUser = function(id, callback){
  cb.get('User-' + id, callback);
};

// An utility function which get, modify and set a document.
function update(docID, mutation, callback){
  cb.get(docID, function(err, doc){
    if(isErr(err, callback)) return;
    console.log('updating:' + docID);
    mutation(doc);
    cb.set(docID, doc, function(err){
      console.log('updated:' + docID + '=' + JSON.stringify(doc)
        + ' err=' + util.inspect(err));
      callback(err);
    });
  });
}

Logic.prototype.startBattle = function(userID, callback) {
  var user;
  var battleID = 'Battle-' + userID + '-' + new Date().getTime();
  var battle = {id: battleID, type: 'Battle', monsters: []};

  async.series({
    user: function(task){
      update('User-' + userID, function(doc) {
        user = doc;
        user.battleID = battleID;
      }, function(err){
        task(err);
      });
    },
    monsters: function(task){
      var q = {};
      cb.view('dev_game', 'monsters_by_level', q, function(err, res){
        console.log('view:' + util.inspect(err) + ' ' + JSON.stringify(res));
        if(isErr(err, task)) return;
        var keys = [];
        res.forEach(function(r){
          keys.push(r.id);
        });
        console.log('keys:' + JSON.stringify(keys));
        cb.get(keys, function(err, doc){
          if(isErr(err, task)) return;
          battle.monsters.push(doc);
        }, function(err){
          task(err);
        });
      });
    },
    battle: function(task){
      battle.users = [{id: userID, hp: user.hp,
        level: user.level, atk: user.atk}];
      cb.add(battleID, battle, function(err){
        task(err);
      });
    }
  }, function(err){
    callback(err, battle);
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
    var battle, user;

    async.series({
      user: function(task){
        update('User-' + userID, function(doc) {
          user = doc;
          user.battleID = battleID;
        }, function(err){
          task(err);
        })},
      battle: function(task){
        update(battleID, function(doc) {
          battle = doc;
          battle.users.push({id: userID, hp: user.hp,
            level: user.level, atk: user.atk});
        }, function(err) {
          task(err);
        });
      }
    }, function(err){
      callback(err, battle);
    });
  });
};

Logic.prototype.rejoinBattle = function(userID, battleID, callback){
  cb.get(battleID, function(err, battle){
    callback(err, battle);
  });
}

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
