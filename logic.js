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
    var mret = mutation(doc);
    if(typeof(mret) === 'boolean' && !mret) {
      callback(null);
      return;
    }
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
  var battle = {id: battleID, type: 'Battle', monsters: {}, users: {}};

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
      // 1 to 3 monsters.
      var numOfMonsters = Math.round(Math.random() * 2) + 1;
      var q = {startkey: user.level, limit: numOfMonsters};
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
          battle.monsters[doc.id] = doc;
        }, function(err){
          task(err);
        });
      });
    },
    battle: function(task){
      battle.users[userID] = {id: userID, hp: user.hp,
        level: user.level, atk: user.atk};
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
          console.log('###' + battle.result);
          if(battle.result) {
            task(new Error('This battle has already finished.'));
            return false;
          }
          if(battle.users[userID]){
            task(new Error(userID + 'has already joined this battle.'));
            return false;
          }
          battle.users[userID] = {id: userID, hp: user.hp,
            level: user.level, atk: user.atk};
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
    if(isErr(err, callback)) return;
    if(battle.result) {
      callback(new Error('This battle has already finished.'));
      return;
    }
    callback(null, battle);
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

Logic.prototype.attack = function(data, callback){
  var battle;
  var messages = [];
  update(data.battleID, function(doc){
    battle = doc;
    var user = battle.users[data.attackerID];
    var monster = battle.monsters[data.attackeeID];

    // user/monster is already dead.
    if(user.hp == 0 || monster.hp == 0) {
      callback(null, battle, messages);
      return;
    }

    // Damage bonus. 0 to 1.
    var damageBonus = Math.round(Math.random() * user.atk);
    var damage = user.atk + damageBonus;
    monster.hp -= damage;
    messages.push(user.id + 'の攻撃!! ' + monster.name + 'に' + damage + 'のダメージ!');

    // Check if monster is still alive.
    if(monster.hp <= 0) {
      monster.hp = 0;
      messages.push(user.id + 'が' + monster.name + 'を倒した!!');

   } else {
      // Counter attack.
      damageBonus = Math.round(Math.random() * monster.atk);
      damage = monster.atk + damageBonus;
      user.hp -= damage;
      messages.push(monster.name + 'のカウンターアタック!! ' + user.id + 'に' + damage + 'のダメージ!');

      if(user.hp <= 0) {
        user.hp = 0;
        messages.push(user.id + 'は力尽きた。。。');
      }
    }
  }, function(err){
    callback(err, battle, messages);
  });
};

function isAllDead(all){
  for(key in all) {
    var a = all[key];
    if(a.hp > 0) {
      return false;
    }
  }
  return true;
}

Logic.prototype.checkBattleState = function(battle, callback) {
  if(isAllDead(battle.monsters)) {
    won(battle.id, callback);
    return;
  }
  if(isAllDead(battle.users)) {
    lost(battle.id, callback);
    return;
  }
  callback(null, battle);
};

function won(battleID, callback){
  var battle;
  var userIDs = [];
  var messages = [];
  update(battleID, function(doc){
    battle = doc;
    battle.result = 'won';
    for(key in battle.users){
      userIDs.push(battle.users[key].id);
    }
  }, function(err){
    if(isErr(err, callback)) return;
    messages.push('プレイヤーの勝利!');
    // Level up!
    async.each(userIDs, function(userID, task){
      update('User-' + userID, function(user){
        user.level++;
        // -5 ~ +5)
        var hpBonus = 33 + (Math.round(Math.random() * 10) - 5);
        user.hp += hpBonus;
        // -2 ~ +2)
        var atkBonus = 3 + (Math.round(Math.random() * 4) - 2);
        user.atk += atkBonus;
        messages.push(user.id + 'はレベル' + user.level + 'になった! HPが'
          + hpBonus + 'あがった、攻撃力が' + atkBonus + 'あがった!');
      }, function(err){
        task(err);
      });
    }, function(err){
      callback(err, battle, messages);
    });
  });
};

function lost(battleID, callback){
  var battle;
  var messages = [];
  update(battleID, function(doc){
    battle = doc;
    battle.result = 'lost';
    messages.push('モンスターたちに敗れた。。。');
  }, function(err){
    callback(err, battle, messages);
  });
};

exports.Logic = Logic;
