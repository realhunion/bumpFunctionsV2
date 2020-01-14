const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

var db = admin.firestore();

// var FieldValue = admin.firestore.FieldValue;

const settings = {timestampsInSnapshots: true};
db.settings(settings);


//Gets [FCMToken, typePhone]
function getfcmToken(userID) {
    return new Promise(function (resolve, reject) {
        db.collection('User-Base').doc(userID).get()
            .then(doc => {
                console.log("DOES fcmToken Exist", userID, ' =', doc.exists);
                if (!doc.exists) {
                    console.log('No such user found to be able to get his/her fcmToken.');
                    resolve(["noToken", 0]);
                } else {
                    // if (doc.data()["fcmToken"] && doc.data()["typePhone"] && doc.data()["version"]) {
                    if (doc.data()["silenceUntil"]) {
                       const currentDate = new Date();
                       const currentDateInMS = Date.parse(currentDate);

                       const silenceUntil = doc.data()["silenceUntil"];
                       const silenceUntilDate = silenceUntil.toDate();
                       const silenceUntilInMS = Date.parse(silenceUntilDate);

                       if(silenceUntilInMS > currentDateInMS) {
                         resolve(["noToken", 0]);
                         return;
                       }
                    }
                    if (doc.data()["fcmToken"] && doc.data()["typePhone"]) {
                        let fcmToken = doc.data()["fcmToken"];
                        let typePhone = doc.data()["typePhone"];
                        console.log("YES TOKEN", fcmToken);
                        resolve([fcmToken, typePhone]);
                    } else {
                      resolve(["noToken", 0]);
                    }
                }
                return;
            })
            .catch(err => {
                console.log('Error getting document', err);
            });
    })
}


//Gets [circleID, circleName, circleEmoji, timestamp, firstMsgText]
function getFeedChatInfo(chatID) {
    return new Promise(function (resolve, reject) {
        db.collection('Feed').doc(chatID).get()
            .then(doc => {
                if (!doc.exists) {
                    console.log('No such user found to be able to get his/her fcmToken.');
                    resolve([null, null, null, null, null]);
                } else {
                    // if (doc.data()["fcmToken"] && doc.data()["typePhone"] && doc.data()["version"]) {
                    if (doc.data()["circleID"] && doc.data()["circleName"] && doc.data()["circleEmoji"] && doc.data()["timeLaunched"] && doc.data()["firstMsgText"]) {
                        let circleID = doc.data()["circleID"];
                        let circleName = doc.data()["circleName"];
                        let circleEmoji = doc.data()["circleEmoji"];
                        let timeLaunched = doc.data()["timeLaunched"];
                        let firstMsgText = doc.data()["firstMsgText"];
                        // console.log('chat info found', [circleID, circleName, circleEmoji, timeLaunched]);
                        resolve([circleID, circleName, circleEmoji, timeLaunched, firstMsgText]);

                    } else {
                      resolve([null, null, null, null, null]);
                    }
                }
                return;
            })
            .catch(err => {
                console.log('Error getting document', err);
            });
    })
}



function sendNotificationToUsers(msgArray) {
    const batchSize = 98;
    var promises = [];
    for (var i = 0; i <= msgArray.length; i += batchSize) {
        let batch = msgArray.slice(i, i + batchSize);
        promises.push(admin.messaging().sendAll(batch));
    }
    return Promise.all(promises);
}



function getCircleFollowerIDArray(circleID) {
    return new Promise(function (resolve, reject) {
        db.collection('LaunchCircles').doc(circleID).collection('Followers').get()
            .then(snapshot => {
              console.log("isLaunchCircle circle empty", circleID, "hmm", snapshot.empty);
              if (snapshot.empty) {
                resolve([]);
                return;
              }
              var followerIDArray = [];
              snapshot.forEach(doc => {
                followerIDArray.push(doc.id);
              });

              resolve(followerIDArray);
              return;
            })
            .catch(err => {
              console.log('Error getting documents', err);
            });
    })
}

function getChatFollowerIDArray(chatID) {
    return new Promise(function (resolve, reject) {
        db.collection('Feed').doc(chatID).collection('Users').get()
            .then(snapshot => {
              if (snapshot.empty) {
                resolve([]);
                return;
              }
              var followerIDArray = [];
              snapshot.forEach(doc => {

                if ((doc.data()["isFollowing"] !== null) && (doc.data()["isFollowing"] === true))
                {
                  followerIDArray.push(doc.id);

                }
              });
              resolve(followerIDArray);
              return;
            })
            .catch(err => {
              console.log('Error getting documents', err);
            });
    })
}

function getChatUserArray(chatID) {
      const p1 = db.collection('Feed').doc(chatID).collection('Users').get()
          .then(snapshot => {
            if (snapshot.empty) {
              return [];
            }
            var userArray = [];
            snapshot.forEach(doc => {

              if (doc.data()["isFollowing"] !== null)
              {
                let isFollowing = doc.data()["isFollowing"];
                var user;
                if((doc.data()["unreadMsgs"] !== null) && (doc.data()["unreadMsgs"] !== undefined)) {
                  console.log("JAMEZ0 - " + doc.data()["unreadMsgs"]);
                  let unreadMsgs = doc.data()["unreadMsgs"];
                  user = {
                    userID: doc.id,
                    isFollowing: isFollowing,
                    unreadMsgs: unreadMsgs,
                  }
                }
                else {
                  console.log("JAMEZ1 - " + doc.data()["unreadMsgs"]);
                  user = {
                    userID: doc.id,
                    isFollowing: isFollowing,
                    unreadMsgs: 0,
                  }
                }

                userArray.push(user);
              }
            })

            return userArray;
          })
          .catch(err => {
            console.log('Error getting documents', err);
            return null;
          })

      return p1;
}




exports.newFeedChatMsgCreated = functions.firestore.document('/Feed/{chatID}/Messages/{messageID}').onCreate((snap, context) => {

    // Get an object representing the document
    // e.g. {'name': 'Marie', 'age': 66}
    const newValue = snap.data();

    const chatID = context.params.chatID;
    const msgText = newValue.text;
    const msgTimestamp = newValue.timestamp;
    const msgUsername = newValue.userName;
    const msgUserID = newValue.userID;
    // var circleID = null;
    // var circleName = null;
    // var timeLaunched = null;


    const p0 = getFeedChatInfo(chatID);

    const p1 = p0.then(function (feedChatInfoArray) {

      console.log("YES 1", feedChatInfoArray);

      var circleID = feedChatInfoArray[0];
      var circleName = feedChatInfoArray[1];
      var circleEmoji = feedChatInfoArray[2];
      var timeLaunched = feedChatInfoArray[3];
      var firstMsgText = feedChatInfoArray[4];

      console.log("popoff 1", timeLaunched);
      console.log("popoff 1.5", msgTimestamp);
      if (timeLaunched.isEqual(msgTimestamp)) {
        // return sendnotif to circle followers
        return sendCircleLaunchNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText);
      } else {
        console.log("popoff 2");
        // return sendnotif to chat followers
        return sendChatMsgNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText);
      }

    })

    return p1;

})


// send notification to chat followers. on 2nd 3rd 4th 5th.


function sendCircleLaunchNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText) {

        console.log("Startign circle launch notifiction functions")
        const p1 = getCircleFollowerIDArray(circleID);

        const p2 = p1.then(function (followerIDArray) {
          console.log("followerIDArray", followerIDArray, "for", circleID);
            const tokenPromiseArray = [];
            for (var i in followerIDArray) {
              let userID = followerIDArray[i];
              console.log("booom", userID, " - ", msgUserID);
              if (userID !== msgUserID) {
                tokenPromiseArray.push(getfcmToken(userID));
              }
            }
            return tokenPromiseArray;
        })

        const p3 = p2.then(function (tokenPromiseArray) {
          console.log("5", tokenPromiseArray.length);
            var tokenArray = Promise.all(tokenPromiseArray);
            return tokenArray;
        })

        const p4 = p3.then(function (tokenArray) {
            console.log("6", tokenArray);
            var tokenArray2 = tokenArray.filter(e => e[0] !== "noToken");

            var payloadArray = [];

            for (var i in tokenArray2) {

              const token = tokenArray2[i][0]
              const typePhone = tokenArray2[i][1]

              if (typePhone === 1) {
                var iosPayload = {
                    notification: {
                        title: circleEmoji + " · " + circleName,
                        body: msgText,
                    },
                    data: {
                      chatID: chatID,
                      msgText: msgText,
                      firstMsgText: firstMsgText,
                      circleID: circleID,
                      circleName: circleName,
                      circleEmoji: circleEmoji,
                    },
                    apns: {
                      headers: {
                          'apns-collapse-id': chatID,
                          'apns-push-type': "alert",
                          "apns-priority": "10",
                      },
                      payload: {
                        aps: {
                          // "content-available" : 1,
                          "sound":"default",
                        },
                      },
                    },
                    token: token,
                }
                payloadArray.push(iosPayload);
              }
              if (typePhone === 2) {
                var androidPayload = {
                  //Launch
                    data: {
                      title: circleEmoji + " · " + circleName,
                      body: msgText,
                      chatID: chatID,
                      msgText: msgText,
                      firstMsgText: firstMsgText,
                      circleID: circleID,
                      circleName: circleName,
                      circleEmoji: circleEmoji,
                    },
                    android: {
                      priority: "high",
                    },
                    token: token,
                }
                payloadArray.push(androidPayload);
              }

            }

            return sendNotificationToUsers(payloadArray);
        })

        return p4;

    }



function sendChatMsgNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText) {

            var chatUArray = [];

            const p1 = getChatUserArray(chatID);

            const p2 = p1.then(function (chatUserArray) {

                chatUArray = chatUserArray;

                const tokenPromiseArray = [];
                for (var i in chatUserArray) {
                    let userID = chatUserArray[i].userID;
                    if (userID !== msgUserID) {
                      tokenPromiseArray.push(getfcmToken(userID));
                    }
                }
                return tokenPromiseArray;
            })

            const p3 = p2.then(function (tokenPromiseArray) {
              console.log("50", tokenPromiseArray.length);
                var tokenArray = Promise.all(tokenPromiseArray);
                return tokenArray;
            })

            const p4 = p3.then(function (tokenArray) {
                console.log("60", tokenArray);
                // var tokenArray2 = tokenArray.filter(e => e[0] !== "noToken");

                var payloadArray = [];

                for (var i in tokenArray) {

                  if(tokenArray[i] === "noToken") {
                    continue;
                  }

                  const token = tokenArray[i][0]
                  const typePhone = tokenArray[i][1]
                  const unreadMsgs = chatUArray[i].unreadMsgs;
                  var unreadMsgsString = "";
                  if (unreadMsgs !== 0) {
                    unreadMsgsString = " (+" + unreadMsgs + " msgs)";
                  }
                  console.log("boss " + unreadMsgs);
                  console.log("voss " + unreadMsgsString);


                  if (typePhone === 1) {
                    //Reply Notif.
                    var iosPayload = {
                        notification: {
                            title: circleName + unreadMsgsString,
                            body: msgUsername + ": " + msgText,
                        },
                        data: {
                          chatID: chatID,
                          msgText: msgText,
                          firstMsgText: firstMsgText,
                          circleID: circleID,
                          circleName: circleName,
                          circleEmoji: circleEmoji,
                        },
                        apns: {
                          headers: {
                              'apns-collapse-id': chatID,
                              'apns-push-type': "alert",
                              "apns-priority": "10",
                          },
                          payload: {
                            aps: {
                              // "content-available" : 1,
                              "sound":"default",
                            },
                          },
                        },
                        token: token,
                    }
                    payloadArray.push(iosPayload);
                  }
                  if (typePhone === 2) {
                    //Reply Notif.
                    var androidPayload = {
                        data: {
                          title: circleName + unreadMsgsString,
                          body: msgUsername + ": " + msgText,
                          chatID: chatID,
                          msgText: msgText,
                          firstMsgText: firstMsgText,
                          circleID: circleID,
                          circleName: circleName,
                          circleEmoji: circleEmoji,
                        },
                        android: {
                          priority: "high",
                        },
                        token: token,
                    }
                    payloadArray.push(androidPayload);
                  }

                }

                return sendNotificationToUsers(payloadArray);
            })

            const p5 = p4.then(function (tokenArray) {

              var batch = db.batch();

              // const increment = admin.firestore.FieldValue.increment(1);
              var incrementPromiseArray = [];
              for (var i in chatUArray) {
                const userID = chatUArray[i].userID;
                const userRef = db.collection('Feed').doc(chatID).collection('Users').doc(userID);
                const incrementPromise = userRef.update({ "unreadMsgs": admin.firestore.FieldValue.increment(1) });
                incrementPromiseArray.push(incrementPromise);
              }

              return Promise.all(incrementPromiseArray);
            })

            return p5;

        }














    function autoDeleteFeedItems() {

      let feedRef = db.collection('Feed');

      const fp0 = feedRef.get().then(snapshot => {
        var chatLaunchedArray = []; // Contains item that is [chatID, timeLaunched]
        snapshot.forEach(doc => {
          console.log(doc.id, '=>', doc.data());
          if (doc.data()["timeLaunched"]) {
            let timeLaunched = doc.data()["timeLaunched"];
            let chatID = doc.id;
            chatLaunchedArray.push([chatID, timeLaunched]);
          }
        })
        return chatLaunchedArray;
      })

      const fp1 = fp0.then(function (chatLaunchedArray)  {

        var chatDeletionPromiseArray = [];

        for(var i in chatLaunchedArray) {

          let chatID = chatLaunchedArray[i][0];
          let timeLaunched = chatLaunchedArray[i][1];

          const currentDate = new Date();
          const currentDateInMS = Date.parse(currentDate);

          const timeLaunchedDate = timeLaunched.toDate();
          const timeLaunchedInMS = Date.parse(timeLaunchedDate);

          if((currentDateInMS - timeLaunchedInMS) > 86400000) { // in Millseconds
            const deletionPromise = db.collection('Feed').doc(chatID).delete();
            chatDeletionPromiseArray.push(deletionPromise);
          }
        }

        return chatDeletionPromiseArray;

      })

      return fp1;
    }



  // exports.autoDeleteFunction = functions.pubsub.schedule('every 6 hours').onRun((context) => {
  //   console.log('Auto Deletion just ran!');
  //   // return autoDeleteFeedItems();
  //   return null;
  // })
