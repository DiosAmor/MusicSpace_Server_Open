const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const dynamoDBTableName_LTT = "MusicSpace_LinkThemeTable";
const dynamoDBTableName_RLT = "MusicSpace_RecommendLinkTable";
const dynamoDBTableName_RLT_v2 = "MusicSpace_RecommendLinkTable_v2";
const dynamoDBTableName_RMT = "MusicSpace_RecommendMusicTable";
const dynamoDBTableName_RMT_v2 = "MusicSpace_RecommendMusicTable_v2";
const dynamoDBTableName_MT = "MusicSpace_MusicTable";

// Resources(endpoints) created in API Gateway
const appthemePath = "/app_server/app_server_theme";
const applinkPath = "/app_server/app_server_link";
const appmusicPath = "/app_server/app_server_music";
const appmusicPathCheck = "/app_server/app_server_music/check";
const appmusicPathLike = "/app_server/app_server_music/like";
const appmusicPathReport = "/app_server/app_server_music/report";
const appmusicPathShare = "/app_server/app_server_music/share";

exports.handler = async function (event) {
  console.log("Request event" + event);
  let response;
  switch (true) {
    case event.httpMethod === "GET" && event.path === appthemePath:
      response = await getThemes();
      break;
    case event.httpMethod === "GET" && event.path === applinkPath:
      response = await getLinks(event.queryStringParameters.UserID);
      break;
    case event.httpMethod === "POST" && event.path === applinkPath:
      response = await saveLink(JSON.parse(event.body));
      break;
    case event.httpMethod === "GET" && event.path === appmusicPath:
      response = await getMusics(event.queryStringParameters.UserID);
      break;
    case event.httpMethod === "POST" && event.path === appmusicPathCheck:
      response = await updateMusicsStateCheck(JSON.parse(event.body));
      break;
    case event.httpMethod === "POST" && event.path === appmusicPathLike:
      response = await updateMusicsStateLike(JSON.parse(event.body));
      break;
    case event.httpMethod === "POST" && event.path === appmusicPathReport:
      response = await updateMusicsStateReport(JSON.parse(event.body));
    break;
    case event.httpMethod === "POST" && event.path === appmusicPathShare:
      response = await updateMusicsStateShare(JSON.parse(event.body));
    break;
    default:
      response = buildResponse(404, "404 Not Found");
  }
return response;
};


// Get themes
async function getThemes() {
  const params = {
      TableName: dynamoDBTableName_LTT
  };
  
  const query_themes = await dynamoDB.scan(params).promise();
  const query_themes_items = query_themes.Items;
  
  let themes = [];
  let index = -1;
  query_themes_items.forEach(element=>{
    if (element.SubTheme == 0)
    {
      let theme_temp = {
        "Theme": element.Theme,
        "data": [],
        "ImgUrlGroup": element.ImgUrl.values
      }
      themes.push(theme_temp);
      index = index+1;
    }
    else
    {
      let theme_temp_data = {
        "Description": element.Description,
        "Tag1": element.Tag1,
        "Tag2": element.Tag2,
        "Tag3": element.Tag3,
        "ImgUrl": element.ImgUrl.values
      }
      themes[index].data.push(theme_temp_data);
    }
  })
  return buildResponse(200, themes);
}


// Get Links for Specific User
async function getLinks(UserID) {
  const params = {
      TableName: dynamoDBTableName_RLT_v2,
      KeyConditionExpression: "UserID = :user_id",
      ProjectionExpression: 'GenerateTime, Description, Tag1, Tag2, Tag3, LinkNumber, ImgUrl',
      ExpressionAttributeValues: {
          ":user_id": UserID
      }
  };
  
  let query_links = await dynamoDB.query(params).promise();
  console.log(query_links)
  console.log(query_links.Items[query_links.Count-1])
  if (query_links.Count != 0){
    const query_links_data = query_links.Items[query_links.Count-1];
    return buildResponse(200, query_links_data);
  }
  else{
    console.log("No user data");
    const no_user_data = 
    {
      LinkNumber: 0,
      Description: '링크를 생성해주세요~!',
      Tag1: 'MusicSpace',
      Tag2: '뮤직스페이스',
      Tag3: '새해 복 많이 받으세요',
      ImgUrl: "https://firebasestorage.googleapis.com/v0/b/musicspace-8a620.appspot.com/o/themeImage%2Flogo.png?alt=media&token=900bbdbb-3e99-439c-9ad9-141e42b8e664",
      GenerateTime: '2023-01-01 00:00:00'
    }
    return buildResponse(200, no_user_data);
  }
}

// Save Link when it generate
async function saveLink(requestBody) {
  const temp_savelink = {
    "UserID": requestBody.UserID,
    "LinkNumber": requestBody.LinkNumber,
    "Description": requestBody.Description,
    "GenerateTime": requestBody.GenerateTime,
    "Tag1": requestBody.Tag1,
    "Tag2": requestBody.Tag2,
    "Tag3": requestBody.Tag3,
    "FCMToken": requestBody.FCMToken,
    "ImgUrl": requestBody.ImgUrl
  };
  const params = {
      TableName: dynamoDBTableName_RLT_v2,
      Item: temp_savelink
  };
  
  //TEST
  if (requestBody.LinkNumber == 1){
    let temp_save_RMT = {
    "UserID": requestBody.UserID,
  	"MusicID": "Admin",
  	"RecommendUser": "Admin",
  	"RecommendTime": requestBody.GenerateTime,
  	"YoutubeVideoID": "js1CtxSY38I",
  	"CheckedRecommend": false,
  	"CheckedLike": false,
  	"CheckedShare": false,
  	"CheckedReport": false,
  	"LinkNumber": -1,
  	"Description": requestBody.Description
  	
    };
    const params = {
        TableName: dynamoDBTableName_RMT_v2,
        Item: temp_save_RMT
    };
  
  await dynamoDB.put(params).promise();
  }
  
  return await dynamoDB
    .put(params)
    .promise()
    .then((response) => {
       const body = {
           Operation: "SAVE",
           Message: "SUCCESS",
           Item: requestBody,
        };
       return buildResponse(200, body);
     },(err) => {
      console.log("ERROR in Save Product: ", err);
     }
  );
}

// Get Musics for Specific Link
async function getMusics(UserID) {
  const params = {
      TableName: dynamoDBTableName_RMT_v2,
      KeyConditionExpression: "UserID = :id",
      ProjectionExpression: 'MusicID, RecommendTime, YoutubeVideoID, CheckedRecommend, CheckedLike, CheckedReport, LinkNumber, Description',
      ExpressionAttributeValues: {
          ":id": UserID
      }
  };
  
  
  const temp = await dynamoDB.query(params).promise();
  let music_data = temp.Items;
  let music_info =[];
  let query_temp =[];
  music_data.forEach(element => {
      let params2 = {
          TableName: dynamoDBTableName_MT,
          KeyConditionExpression: "YoutubeVideoID = :yvid",
          ProjectionExpression: 'YoutubeThumbnailUrl, YoutubeTitle, YoutubeChannel, NumReport',
          ExpressionAttributeValues: {
              ":yvid": element.YoutubeVideoID
          }
      };
      query_temp.push(dynamoDB.query(params2).promise().then(value => {
        let temp2 = {...element, ...value.Items[0]};
        music_info.push(temp2);
      }));
    });
  return await Promise.all(query_temp).then(values=>{
      console.log("Sort전:",music_info);
        music_info.sort((a,b)=>{
          return new Date(a.RecommendTime).getTime() - new Date(b.RecommendTime).getTime();
        });
        console.log("돌려보내는 데이터", music_info);
      return buildResponse(200, music_info.reverse());
  })
  .catch(err =>{
      console.log(err);
      console.log(buildResponse(400, err));
    
  });
}

// Update MusicState check recommend
async function updateMusicsStateCheck(requestBody) {
  const params = {
    TableName: dynamoDBTableName_RMT_v2,
    Key: {
      UserID: requestBody.UserID,
      MusicID: requestBody.MusicID
    },
    UpdateExpression: `set CheckedRecommend= :CheckedR`,
    ExpressionAttributeValues: {
      ":CheckedR": requestBody.CheckedRecommend
    },
    ReturnValues: "UPDATED_NEW",
 };

 let update_tables = [];
 let update_info = [];
 update_tables.push(dynamoDB.update(params).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    };
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(401, err));
 }));
 
 
 return await Promise.all(update_tables).then(values=>{
      console.log(update_info);
      return buildResponse(200, update_info);
  })
  .catch(err =>{
      console.log("ERROR in Update Product: ", err);
      console.log(buildResponse(400, err));
    
  });
}

// Update MusicState-Like
async function updateMusicsStateLike(requestBody) {
  const params = {
    TableName: dynamoDBTableName_RMT_v2,
    Key: {
      UserID: requestBody.UserID,
      MusicID: requestBody.MusicID
    },
    UpdateExpression: `set CheckedLike= :CheckedL`,
    ExpressionAttributeValues: {
      ":CheckedL": requestBody.CheckedLike,
    },
    ReturnValues: "UPDATED_NEW",
 };
 const params2 = {
    TableName: dynamoDBTableName_MT,
    Key: {
      YoutubeVideoID: requestBody.YoutubeVideoID
    },
    UpdateExpression: `set NumLike= NumLike+:ChangeL`,
    ExpressionAttributeValues: {
      ":ChangeL": requestBody.ChangeLike
    },
    ReturnValues: "UPDATED_NEW",
 };
 let update_tables = [];
 let update_info = [];
 update_tables.push(dynamoDB.update(params).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    }
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(401, err));
 }));
 update_tables.push(dynamoDB.update(params2).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    }
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(402, err));
 }));
 
 return await Promise.all(update_tables).then(values=>{
      console.log(update_info);
      return buildResponse(200, update_info);
  })
  .catch(err =>{
      console.log("ERROR in Update Product: ", err);
      console.log(buildResponse(400, err));
    
  });
}

// Update MusicState-report
async function updateMusicsStateReport(requestBody) {
  const params = {
    TableName: dynamoDBTableName_RMT_v2,
    Key: {
      UserID: requestBody.UserID,
      MusicID: requestBody.MusicID
    },
    UpdateExpression: `set CheckedReport=:CheckedRe`,
    ExpressionAttributeValues: {
      ":CheckedRe": requestBody.CheckedReport
    },
    ReturnValues: "UPDATED_NEW",
 };
 const params2 = {
    TableName: dynamoDBTableName_MT,
    Key: {
      YoutubeVideoID: requestBody.YoutubeVideoID
    },
    UpdateExpression: `set NumReport=NumReport+:ChangeRe`,
    ExpressionAttributeValues: {
      ":ChangeRe": requestBody.ChangeReport
    },
    ReturnValues: "UPDATED_NEW",
 };
 let update_tables = [];
 let update_info = [];
 update_tables.push(dynamoDB.update(params).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    };
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(401, err));
 }));
 update_tables.push(dynamoDB.update(params2).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    };
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(402, err));
 }));
 
 return await Promise.all(update_tables).then(values=>{
      console.log(update_info);
      return buildResponse(200, update_info);
  })
  .catch(err =>{
      console.log("ERROR in Update Product: ", err);
      console.log(buildResponse(400, err));
    
  });
}

// Update MusicState-share
async function updateMusicsStateShare(requestBody) {
  const params = {
    TableName: dynamoDBTableName_RMT_v2,
    Key: {
      UserID: requestBody.UserID,
      MusicID: requestBody.MusicID
    },
    UpdateExpression: `set CheckedShare=:CheckedS`,
    ExpressionAttributeValues: {
      ":CheckedS": requestBody.CheckedShare
    },
    ReturnValues: "UPDATED_NEW",
 };
 const params2 = {
    TableName: dynamoDBTableName_MT,
    Key: {
      YoutubeVideoID: requestBody.YoutubeVideoID
    },
    UpdateExpression: `set NumShare= NumShare+:CheckedS`,
    ExpressionAttributeValues: {
      ":CheckedS": Number(requestBody.CheckedShare)
    },
    ReturnValues: "UPDATED_NEW",
 };
 let update_tables = [];
 let update_info = [];
 update_tables.push(dynamoDB.update(params).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    };
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(401, err));
 }));
 update_tables.push(dynamoDB.update(params2).promise().then(value => {
    const body = {
         Operation: "UPDATE",
         Message: "SUCCESS",
         UpdatedAttributes: value,
    };
    update_info.push(body);
 })
 .catch(err => {
    console.log(err);
    console.log(buildResponse(402, err));
 }));
 
 return await Promise.all(update_tables).then(values=>{
      console.log(update_info);
      return buildResponse(200, update_info);
  })
  .catch(err =>{
      console.log("ERROR in Update Product: ", err);
      console.log(buildResponse(400, err));
    
  });
}


// For specific response structure
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
       "Content-Type": "application/json",
    },
    body: JSON.stringify(body)
  };
}