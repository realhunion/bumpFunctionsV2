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
                        const fcmToken = doc.data()["fcmToken"];
                        const typePhone = doc.data()["typePhone"];
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
                        const circleID = doc.data()["circleID"];
                        const circleName = doc.data()["circleName"];
                        const circleEmoji = doc.data()["circleEmoji"];
                        const timeLaunched = doc.data()["timeLaunched"];
                        const firstMsgText = doc.data()["firstMsgText"];
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
              if (snapshot.empty) {
                resolve([]);
                return;
              }
              let followerIDArray = [];
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
              let followerIDArray = [];
              snapshot.forEach(doc => {

                if (doc.data()["isFollowing"]) {
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
            let userArray = [];
            snapshot.forEach(doc => {

              if (doc.data()["isFollowing"]) {

                const isFollowing = doc.data()["isFollowing"];
                var user;

                if (doc.data()["unreadMsgs"]) {
                  const unreadMsgs = doc.data()["unreadMsgs"];
                  const userID = doc.id;
                  user = {
                    userID: userID,
                    isFollowing: isFollowing,
                    unreadMsgs: unreadMsgs,
                  }
                }
                else {
                  const userID = doc.id;
                  user = {
                    userID: userID,
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
    const newValue = snap.data();

    const chatID = context.params.chatID;
    const msgText = newValue.text;
    const msgTime = newValue.timestamp;
    const msgUsername = newValue.userName;
    const msgUserID = newValue.userID;


    const p0 = getFeedChatInfo(chatID);

    const p1 = p0.then(function (feedChatInfoArray) {

      console.log("YES 1", feedChatInfoArray);

      const circleID = feedChatInfoArray[0];
      const circleName = feedChatInfoArray[1];
      const circleEmoji = feedChatInfoArray[2];
      const launchTime = feedChatInfoArray[3];
      const firstMsgText = feedChatInfoArray[4];

      if (launchTime.isEqual(msgTime)) {
        // return sendnotif to circle followers
        return sendCircleLaunchNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText, launchTime, msgTime);
      } else {
        console.log("popoff 2");
        // return sendnotif to chat followers
        return sendChatMsgNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText, launchTime, msgTime);
      }

    })

    return p1;

})


// Send notification to chat followers. on 2nd 3rd 4th 5th msg.
function sendCircleLaunchNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText, launchTime, msgTime) {

        const p1 = getCircleFollowerIDArray(circleID);

        const p2 = p1.then(function (followerIDArray) {
            let tokenPromiseArray = [];
            for (var i in followerIDArray) {
              const userID = followerIDArray[i];
              if (userID !== msgUserID) {
                tokenPromiseArray.push(getfcmToken(userID));
              }
            }
            return tokenPromiseArray;
        })

        const p3 = p2.then(function (tokenPromiseArray) {
          console.log("5", tokenPromiseArray.length);
            const tokenArray = Promise.all(tokenPromiseArray);
            return tokenArray;
        })

        const p4 = p3.then(function (tokenArray) {
            console.log("6", tokenArray);
            // var tokenArray2 = tokenArray.filter(e => e[0] !== "noToken");

            let payloadArray = [];

            for (var i in tokenArray) {

              if(tokenArray[i] === "noToken") {
                continue;
              }

              const token = tokenArray[i][0]
              const typePhone = tokenArray[i][1]

              const launchTimeEpochMS = Date.parse(launchTime.toDate()).toString();
              const msgTimeEpochMS = Date.parse(msgTime.toDate()).toString();

              if (typePhone === 1) {
                const iosPayload = {
                    notification: {
                        // title: circleEmoji + " · " + circleName,
                        // subtitle : "(Follow to receive notifs)",
                        // body: msgText,
                    },
                    data: {
                      chatID: chatID,
                      msgText: msgText,
                      firstMsgText: firstMsgText,
                      circleID: circleID,
                      circleName: circleName,
                      circleEmoji: circleEmoji,
                      timeLaunched: launchTimeEpochMS,
                      msgTime: msgTimeEpochMS,
                    },
                    apns: {
                      headers: {
                          'apns-collapse-id': chatID,
                          'apns-push-type': "alert",
                          "apns-priority": "10",
                      },
                      payload: {
                        aps: {
                          alert : {
                            subtitle: circleEmoji + " · " + circleName,
                            title : "(Follow chat to get notifications)",
                            body: msgText,
                          },
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
                const androidPayload = {
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
                      timeLaunched: launchTimeEpochMS,
                      msgTime: msgTimeEpochMS,
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



function sendChatMsgNotifications(chatID, circleID, circleName, circleEmoji, msgText, msgUsername, msgUserID, firstMsgText, launchTime, msgTime) {

            //filtered chatUserArray
            let chatUArray = [];

            const p1 = getChatUserArray(chatID);

            const p2 = p1.then(function (chatUserArray) {

              console.log("40", chatUserArray);

                let tokenPromiseArray = [];
                for (var i in chatUserArray) {
                    const chatUser = chatUserArray[i]
                    const userID = chatUser.userID;
                    if (userID !== msgUserID) {
                      tokenPromiseArray.push(getfcmToken(userID));
                      chatUArray.push(chatUser);
                    }
                }
                return tokenPromiseArray;
            })

            const p3 = p2.then(function (tokenPromiseArray) {
              console.log("50", tokenPromiseArray.length);
                const tokenArray = Promise.all(tokenPromiseArray);
                return tokenArray;
            })

            const p4 = p3.then(function (tokenArray) {
                console.log("60", tokenArray);
                // var tokenArray2 = tokenArray.filter(e => e[0] !== "noToken");

                let payloadArray = [];

                for (var i in tokenArray) {

                  if(tokenArray[i] === "noToken") {
                    continue;
                  }

                  const token = tokenArray[i][0]
                  const typePhone = tokenArray[i][1]
                  const unreadMsgs = chatUArray[i].unreadMsgs;
                  let unreadMsgsString = "";
                  if (unreadMsgs !== 0) {
                    unreadMsgsString = " (+" + unreadMsgs + " msgs)";
                  }
                  console.log("boss " + unreadMsgs);
                  console.log("voss " + unreadMsgsString);

                  const launchTimeEpochMS = Date.parse(launchTime.toDate()).toString();
                  const msgTimeEpochMS = Date.parse(msgTime.toDate()).toString();

                  if (typePhone === 1) {
                    //Reply Notif.
                    const iosPayload = {
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
                          timeLaunched: launchTimeEpochMS,
                          msgTime: msgTimeEpochMS,
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
                    const androidPayload = {
                        data: {
                          title: circleName + unreadMsgsString,
                          body: msgUsername + ": " + msgText,
                          chatID: chatID,
                          msgText: msgText,
                          firstMsgText: firstMsgText,
                          circleID: circleID,
                          circleName: circleName,
                          circleEmoji: circleEmoji,
                          timeLaunched: launchTimeEpochMS,
                          msgTime: msgTimeEpochMS,
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

              // const increment = admin.firestore.FieldValue.increment(1);
              let incrementPromiseArray = [];
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

      const p0 = db.collection('Feed').get().then(snapshot => {
        let chatLaunchedArray = []; // Contains item that is [chatID, timeLaunched]
        snapshot.forEach(doc => {
          if (doc.data()["timeLaunched"]) {
            const timeLaunched = doc.data()["timeLaunched"];
            const chatID = doc.id;
            chatLaunchedArray.push([chatID, timeLaunched]);
          }
        })
        return chatLaunchedArray;
      })

      const p1 = fp0.then(function (chatLaunchedArray)  {

        let chatDeletionPromiseArray = [];

        for(var i in chatLaunchedArray) {

          const chatID = chatLaunchedArray[i][0];
          const timeLaunched = chatLaunchedArray[i][1];

          const currentDate = new Date();
          const currentDateInMS = Date.parse(currentDate);

          const timeLaunchedDate = timeLaunched.toDate();
          const timeLaunchedInMS = Date.parse(timeLaunchedDate);

          if((currentDateInMS - timeLaunchedInMS) > 86400000) { // currently 24h in Millseconds
            const deletionPromise = db.collection('Feed').doc(chatID).delete();
            chatDeletionPromiseArray.push(deletionPromise);
          }
        }

        return chatDeletionPromiseArray;

      })

      return p1;
    }



  // exports.autoDeleteFunction = functions.pubsub.schedule('every 6 hours').onRun((context) => {
  //   console.log('Auto Deletion just ran!');
  //   // return autoDeleteFeedItems();
  //   return null;
  // })
