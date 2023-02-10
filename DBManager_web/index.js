const AWS = require("aws-sdk");
const {google} = require('googleapis');
const firebase_admin = require("firebase-admin");

const serviceAccount = require("./firbase-admin_test.json");

firebase_admin.initializeApp({
  credential: firebase_admin.credential.cert(serviceAccount)
});


const dynamoDB = new AWS.DynamoDB.DocumentClient();
const dynamoDBTableName_RLT_web = "MusicSpace_RecommendLinkTable_web";
const dynamoDBTableName_RLT_v2 = "MusicSpace_RecommendLinkTable_v2";
const dynamoDBTableName_RMT = "MusicSpace_RecommendMusicTable";
const dynamoDBTableName_RMT_v2 = "MusicSpace_RecommendMusicTable_v2";
const dynamoDBTableName_SKT = "MusicSpace_SearchKeywordTable";
const dynamoDBTableName_MT = "MusicSpace_MusicTable";

// Resources(endpoints) created in API Gateway
const weblinkPath = "/web_server/web_server_link";
const webmusicPath = "/web_server/web_server_music";

exports.handler = async function (event) {
  console.log("Request event" + event);
  let response;
  switch (true) {
    case event.httpMethod === "GET" && event.path === weblinkPath:
      response = await getWebLink(event.queryStringParameters.UserID);
      break;
    case event.httpMethod === "POST" && event.path === weblinkPath:
      response = await saveSearch(JSON.parse(event.body));
      break;
    case event.httpMethod === "POST" && event.path === webmusicPath:
      response = await saveRecommendMusic(JSON.parse(event.body));
      break;
    default:
      response = buildResponse(404, "404 Not Found");
  }
return response;
};



//get link data at web
async function getWebLink(ID) {
  const params = {
      TableName: dynamoDBTableName_RLT_v2,
      KeyConditionExpression: "UserID = :ID",
      ProjectionExpression: 'GenerateTime, Description, Tag1, Tag2, Tag3, ImgUrl, LinkNumber',
      ExpressionAttributeValues: {
          ":ID": ID
      }
  };
  
  const expiration_time = 25*60*60*1000; //만료 시간은: 25시간
  return await dynamoDB
      .query(params)
      .promise()
      .then((response) => {
        //server 시간 기준은 UTC 0 이므로 한국 시간이 9시간 빠르다.
        const GMT = 9*60*60*1000;
        const server_time= new Date().getTime()+GMT;
        const link_ge_time= new Date(response.Items[0].GenerateTime).getTime();
        console.log("serverTime: ", new Date(server_time), "LinkGenerateTime: ", new Date(link_ge_time));
        if (server_time-link_ge_time < expiration_time){
            console.log(response.Items[0]);
            return buildResponse(200, response.Items[0]);
        }
        else{
          console.log("Link is expired");
          return buildResponse(200, "Expired");
        }
      },
      (err) => {
          console.log(err);
          return buildResponse(400, err);
      });
}

//save SearchKeyword at web and sending search result
async function saveSearch(requestBody) {
  const params = {
      TableName: dynamoDBTableName_SKT,
      KeyConditionExpression: "SearchKeyword = :SK",
      ProjectionExpression: 'SearchKeyword, YoutubeVideo, SearchTime',
      ExpressionAttributeValues: {
          ":SK": requestBody.SearchKeyword
      }
  };
  
  const query_data = await dynamoDB.query(params).promise();
  console.log(query_data);
  let searchTimeSet =[];
  
  query_data.Items.forEach(element=> {searchTimeSet.push(new Date(element.SearchTime))});
  const latest_searchTime = Math.max(...searchTimeSet);
  //캐싱 기간 설정
  const data_caching_period = 24*60*60*1000*7;
  const request_searchtime = new Date(requestBody.SearchTime);
  console.log("저장된 데이터 검색 시간: ", new Date(latest_searchTime));
  console.log("검색 요청 시간: ", request_searchtime);
  console.log("캐싱 데이터를 써야 하나?: ", latest_searchTime + data_caching_period > request_searchtime.getTime());
  
  if (query_data.Items.length > 0 & latest_searchTime + data_caching_period > request_searchtime.getTime()){
    let searchkeyword = query_data.Items[query_data.Items.length-1].SearchKeyword;
    let YoutubeVideos = query_data.Items[query_data.Items.length-1].YoutubeVideo;

    //NumSearchKeyword +1
    const words = new Date(latest_searchTime).toISOString().split('T');
    const words2 = words[1].split('.');
    const words3 = words[0]+' '+words2[0];
    const params2 = {
        TableName: dynamoDBTableName_SKT,
        Key: {
            SearchKeyword: requestBody.SearchKeyword,
            SearchTime: words3
          },
          UpdateExpression: 'set NumSearchKeyword = NumSearchKeyword+:R',
          ExpressionAttributeValues: {
            ":R": 1
          },
          ReturnValues: "UPDATED_NEW",
    };
    await dynamoDB.update(params2).promise();
    console.log(YoutubeVideos);
    
    let responseBody={
      "SearchKeyword":searchkeyword,
      "SearchTime": words3,
      "YoutubeVideo":YoutubeVideos
    };
    // console.log("sending", responseBody);
    return buildResponse(200, responseBody);
  }
  else{
    const temp_SelectedNumVideo = new Array(50).fill(0);
    
    //youtube search
    let youtube = Youtube_start();
    let search_result = await search(youtube, requestBody.SearchKeyword);
    //data.items: 결과, status: 에러 상태
    let search_status = search_result.status;
    console.log(search_status);
    let search_result_items = search_result.data.items;
    let temp_YoutubeVideos =[];
    
    search_result_items.forEach(element=>{
      const temp_videos = [
        element.snippet.channelTitle,
        element.snippet.thumbnails.high.url,
        element.snippet.title,
        element.id.videoId
      ];
      temp_YoutubeVideos.push(temp_videos);
    });
    
    let temp_saveSearchResult = {
      "SearchKeyword": requestBody.SearchKeyword,
      "SearchTime": requestBody.SearchTime,
      "NumSearchKeyword": 1,
      "YoutubeVideo": temp_YoutubeVideos,
      "SelectedNumVideo": temp_SelectedNumVideo
    };
    const params2 = {
      TableName: dynamoDBTableName_SKT,
      Item: temp_saveSearchResult
    };
    await dynamoDB.put(params2).promise();
    console.log("There is no search data");
    
    let responseBody={
      "SearchKeyword":requestBody.SearchKeyword,
      "SearchTime": requestBody.SearchTime
    };
    responseBody = {
      ...responseBody,
      "YoutubeVideo":temp_YoutubeVideos
    };
    return buildResponse(200, responseBody);
  }
}


//save recommend music at web
async function saveRecommendMusic(requestBody) {
  let temp_save_RMT = {
    "UserID": requestBody.UserID,
  	"MusicID": requestBody.MusicID,
  	"RecommendUser": requestBody.RecommendUser,
  	"RecommendTime": requestBody.RecommendTime,
  	"YoutubeVideoID": requestBody.YoutubeVideoID,
  	"CheckedRecommend": false,
  	"CheckedLike": false,
  	"CheckedShare": false,
  	"CheckedReport": false,
  	"LinkNumber": requestBody.LinkNumber
  	
  };
  const params = {
      TableName: dynamoDBTableName_RMT_v2,
      Item: temp_save_RMT
  };
  
  await dynamoDB.put(params).promise();
  
  const params2_1 = {
      TableName: dynamoDBTableName_MT,
      KeyConditionExpression: "YoutubeVideoID = :yv_id",
      ProjectionExpression: 'YoutubeVideoID',
      ExpressionAttributeValues: {
        ":yv_id": requestBody.YoutubeVideoID
    }
  };
  const MT_available = await dynamoDB.query(params2_1).promise();
  
  if (!MT_available.Items.length) {
    console.log("non exist", MT_available.Items);
    const temp_save_MT = {
      "YoutubeVideoID": requestBody.YoutubeVideoID,
      "YoutubeThumbnailUrl": requestBody.YoutubeThumbnailUrl,
    	"YoutubeTitle": requestBody.YoutubeTitle,
    	"YoutubeChannel": requestBody.YoutubeChannel,
    	"NumShare": 0,
    	"NumLike": 0,
    	"NumRecommend": 1,
    	"NumReport": 0
    };
    const params2_2 = {
        TableName: dynamoDBTableName_MT,
        Item: temp_save_MT
    };
    await dynamoDB.put(params2_2).promise();
  }
  else{
    console.log("exist", MT_available.Items);
    const params2_2 = {
        TableName: dynamoDBTableName_MT,
        Key: {
          YoutubeVideoID: requestBody.YoutubeVideoID
        },
        UpdateExpression: `set NumRecommend = NumRecommend+:R`,
        ExpressionAttributeValues: {
          ":R": 1
        },
        ReturnValues: "UPDATED_NEW",
    };
    await dynamoDB.update(params2_2).promise();
  }
  
  //fcm을 이용해 알림을 보내야한다.
  const params3 = {
      TableName: dynamoDBTableName_RLT_v2,
      KeyConditionExpression: "UserID = :ID",
      ProjectionExpression: 'FCMToken',
      ExpressionAttributeValues: {
          ":ID": requestBody.UserID
      }
  };
  let FCMToken;
  await dynamoDB.query(params3).promise().then((response)=>{
    FCMToken = response.Items[0].FCMToken;
    console.log(FCMToken);
  });
  
  const message = {
    notification:{
      title:"MusicSpace",
      body:"새로운 노래가 추천 되었어요! 💌"
    },
    token: FCMToken,
    android:{
      priority:"high"
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        },
      },
      headers: {
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-topic': '', // your app bundle identifier
      },
    }
  };
  await firebase_admin.messaging().send(message)
    .then(response=> {
      console.log('Successfully sent message: : ', response);
    })
    .catch(err=>{
        console.log('Error Sending message!!! : ', err);
  });
  
  //선택된 비디오 키워드에서 번호 업데이트
  let selected_number = String(requestBody.SelectedNumber);
  const params4 = {
      TableName: dynamoDBTableName_SKT,
      Key: {
          SearchKeyword: requestBody.SearchKeyword,
          SearchTime: requestBody.SearchTime
        },
        UpdateExpression: 'set SelectedNumVideo[' +selected_number+ ']= SelectedNumVideo['+selected_number+']+:R',
        ExpressionAttributeValues: {
          ":R": 1
        },
        ReturnValues: "UPDATED_NEW",
  };
  
  return await dynamoDB
    .update(params4)
    .promise()
    .then((response) => {
       const body = {
           Operation: "SAVE",
           Message: "SUCCESS"
        };
       return buildResponse(200, body);
     },(err) => {
      console.log("ERROR in Save Product: ", err);
     }
  );
}

// For specific response structure
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Headers" : "Accept,Accept-Language,Content-Language,Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      "Content-Type": "application/json",
      "Accept-Language": "*",
      "Accept":"*/*",
      "Content-Language":"*"
    },
    body: JSON.stringify(body)
  };
}

//youtube api key (실제 업로드할 때만 키 넣기)
function Youtube_start(){
  const youtube = google.youtube({
    version:'v3',
    auth: ''
  });
  console.log("youtube_init");
  return youtube;
}

//youtube search
async function search(youtube, keyword){
  let request = await youtube.search.list({
    q: keyword,
    part: 'snippet',
    topicId: "/m/04rlf",
    maxResults:50,
    type: "video"
  });
  
  // console.log("data.items: ", request.data.items);
  return request;
  
}