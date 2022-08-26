npm install wsfls <br>
для браузера <a href="https://www.npmjs.com/package/wsflc">тут</a>
```

const fs = require("fs")
const path = require("path");

var ssl = {
    key: fs.readFileSync(path.join(__dirname, "cert", "ca.key")),
    cert: fs.readFileSync(path.join(__dirname, "cert", "ca.crt"))
}

let FileLoader = require("wsfls");
let fl = new FileLoader("Files", 3210, ssl);// ./Files ця папка повинна існувати // ssl не обов'язково
let id = 78146
let key = "go hall"

fl.upload.StartUpload = (data, fun) => 
{ // data === якась інформація для авторизації
    if (data.id === id && data.key === key)
        fun(true, {message: "я дозволяю завантаження файла на сервер"}) //дозвіл ,  response === all // функцію визвать обовязково 
    else
        fun(false, "id або key невірний"); // функцію визвать обовязково 
}

fl.upload.EndUpload = (data, fun) => 
{ // data таж сама що і в StartUpload
    // папки повинні існувати
    if (data.id === id && data.key === key)
        fun(true, "Video/" + data.fileName, {message: "я дозволяю зберегти файл", filename: data.ji}) // функцію визвать обовязково 
    else// шлях до файлу буде "./Files/Video/" + e.target.files[0].name
        fun(false, undefined ,{message: "я не дозволяю зберегти файл"}); // функцію визвать обовязково 
}

fl.upload.AbortUpload = (header) => 
{
    console.log("AbortUpload", header)
}

/*-------*/


fl.download.StartDownload = (data, fun) => 
{ //fun(allowDownload : boolean, filePath : String, response : all)   функцію визвать обовязково ане то робота не продовжиться
    if (data.id === id && data.key === key) 
    {
        
        let type = data.fileName.split(".")[1];
        if (type === "jpg" || type === "png")
            type = "img/";
        else if (type === "mp4")
            type = "video/";
        else
            type = "ather/"

        fun(true, type + data.fileName, {message: "я дозволяю завантаження файла клієнту"}) //дозвіл ,  response === all // функцію визвать обовязково 
    } 
    else
        fun(false, undefined, "id або key невірний");// функцію визвать обовязково 
}

fl.download.EndDownload = (data) => 
{//data те саме що і в fl.download.StartDownload
  //  console.log(data)// header
   return "це отримає браузер" // "це отримає браузер" || 42 || {} || boolean || undefined || null 
}

fl.download.AbortDownload = () => 
{
    console.log("AbortDownload")
}
