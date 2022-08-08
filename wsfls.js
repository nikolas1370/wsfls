const socket = require("wscs") // зхаміни на завісімость
const fs = require("fs")
const uuid = require("uuid")
const packetSize = 128 * 1024
let FileLoader;
let timeStart = new Date().getTime() // шоб при пере перезагрузкі сервера небуло проблем з загрузкою

/**
 * 
 * @param {Array} loaderArray 
 * @param {Number} id 
 * @param {String} key 
 */
function loaderFind (loaderArray, id, key) 
{
    for (let i = 0; i < loaderArray.length; i++) 
    {
        if(loaderArray[i].id === id)
        {
            if(loaderArray[i].key === key)
                return loaderArray[i]
            else 
                return;
        }                        
    }    
}

class LoaderU
{
    constructor(id , key, temporaryName)
    { 
        return {id: id, key: key, temporaryName : temporaryName}
    } 
}
class LoaderD
{
    constructor(id , key, filePath, size, fileID)
    { 
        return {id: id, key: key, filePath: filePath, size : size, fileID : fileID} 
    } 
}

function deleteFromFolderAllFile(_path)
{
    fs.readdir(_path, (err, files) => // не я 
    {
        for (const file of files) 
          fs.unlink(_path + file, err => {console.log(err)});
    });
}

let filesFolderPath = ""
let temporaryFilesPath = ""

class FileLoaderServer// буде стаорено тіки раз
{
    /**
     * 
     * @param {String} _filesFolderPath 
     * @param {*} port 
     * @param {*} ssl 
     * @returns 
     */
    constructor(_filesFolderPath, port ,ssl)
    {       
        if(FileLoader)
            return FileLoader

        if(typeof(_filesFolderPath) !== "string")
            return console.error("filesFolderPath error");

        FileLoader = this; 
        filesFolderPath = "./" + _filesFolderPath + "/";
        temporaryFilesPath  = filesFolderPath + "temporaryFiles/"
        
        try { fs.mkdirSync(temporaryFilesPath) } catch (error) {}
        deleteFromFolderAllFile(temporaryFilesPath)

        this.upload = new Upload();
        this.download = new Download();

        this._socket = new socket(port, ssl ,(sc)=>
        {
            this.upload.newSocket(sc);
            this.download.newSocket(sc);
        });
   
        
    }
}

class Download
{
    constructor()
    {
        this.id = 0
        // StartDownload EndDownload AbortDownload оприділя користувач 
        /** перед  загрузкой
         * @param {all} data // ниже  filePath відносний
         * @param {function} fun fun(allowDownload : boolean, filePath : String response : all)   функцію визвать обовязково ане то робота не продовжиться
         */
        this.StartDownload = (data, fun) => {fun(false) }

        
        this.EndDownload = () => {}
        this.AbortDownload = () => {}

        this.loaderArray = []// LoaderD
    }

    newSocket(sc)
    {
        let loader; // LoaderD
        let reconnected = false;  
        let createLoader = () => { return new LoaderD(this.id++, uuid.v4()) }

        let closeFile = () => 
        {
            if(loader && loader.fileID)
            {
                fs.close(loader.fileID, () => {})
                loader.fileID = undefined
            }
        }

        /**
         * @param {*} callbackOpen(size)
         * @param {*} callbackErrar 
         */
        let openFile = (callbackOpen, callbackErrar) => 
        {
            fs.stat( loader.filePath,  (err, stat) =>
            {                
                if(err)
                {
                    loader.filePath = undefined;       
                    return callbackErrar(err)
                }

                loader.size = stat.size;                
                fs.open(loader.filePath, 'r', (_err, fd) => 
                {
                    if(err)
                    {
                        loader.size = undefined;
                        loader.filePath = undefined;       
                        return callbackErrar(err)
                    }
    
                    loader.fileID = fd;      
                    callbackOpen(fd, stat.size);
                })
            })            
        }

        sc.setEventClose(() => closeFile());
        sc.on("StartDownload", (data) => //data {id, key, request} 
        {
            if(!loader)
                loader = loaderFind(this.loaderArray, data.id, data.key)

            if(loader && loader.filePath)
                reconnected = true;     
            else// значить в первий раз
            {
                reconnected = false;
                loader = createLoader()
                this.loaderArray.push(loader);
            }

            if(reconnected)
                return  openFile( (fd, size) => sc.send("StartDownloadResponse", {status: true, size: size, id: loader.id, key: loader.key, codeLoad : timeStart}),  (er) => sc.send("StartDownloadResponse", {status: false, notallowed: false}))

            let functionUsed = false;                
            this.StartDownload(data.request, (allowDownload = false,  filePath, response) =>
            {
                if(functionUsed)
                    return;
                else
                    functionUsed = true;

                if(allowDownload)
                {                    
                    loader.filePath = filesFolderPath + filePath;
                    return openFile( (fd, size) => sc.send("StartDownloadResponse", {status: true, size: size, id: loader.id, key: loader.key, response: response, codeLoad : timeStart}), () => {sc.send("StartDownloadResponse", {status: false, notallowed: false})})
                }

                loader.filePath = undefined;         
                sc.send("StartDownloadResponse", {status: false, response: response, notallowed: true})
            });  
        })
        
        sc.on("Download", (data) => // data {size, codeLoad} // size скіки в клієнта є байтів
        {
            let size = data.size;

            if(data.codeLoad !== timeStart) 
                return console.log("codeLoad  !==", data)
            
            if(!loader || !loader.filePath)
                return sc.send("DownloadResponse", {status : false})

            if(size >= loader.size)
            {
                loader.filePath = undefined;  
                return sc.send("EndDownload", this.EndDownload());
            }

            let mj = (packetSize + size > loader.size ? loader.size - size : packetSize) 
            let buffer = Buffer.alloc(mj)

            let read = () => 
            {
                fs.read(loader.fileID, buffer, 0, mj, size, (err, byteLength, buf) =>
                {
                    if(err)
                        return sc.send("DownloadResponse", {status : false})
    
                    sc.send("DownloadResponse", buf)
                });
            }
            if(loader.fileID)// бо кудась може потіряться
                read();
            else
            {
                openFile((fb, xize) =>
                {
                    loader.fileID = fb;
                    read();
                }, () => sc.send("DownloadResponse", {status : false}))
            }          
        } );

        sc.on("AbortDownload", () =>
        {
            loader.filePath = undefined;  
            sc.send("AbortDownloadResponse", {status: true })
            this.AbortDownload();
        });        
    }
}

class Upload
{
    constructor(sc)
    {
        this.id = 0    
        this.StartUpload = (data, fun) => {fun(false)}
        this.EndUpload = (data, fun) => {fun(false)}
        this.AbortUpload = () => {}
        this.loaderArray = []// LoaderU   
    }

    newSocket(sc)
    {
        let createLoader = () =>
        {
            let key = uuid.v4()
            return new LoaderU(this.id++, key) 
        }
        let loader; 
        let reconnectedUp = false;  
        
        sc.on("StartUpload", (data = {}) =>  // data {id, key, request} 
        {// визивається і при востановленні завантаження 
            let  verifyRequest = () =>
            {                
                let functionUsed = false;// захист від повторного використання функції
                this.StartUpload(data.request, (allowUpload = false, response = {}) =>
                {
                    if(functionUsed)
                        return;
                    else
                        functionUsed = true;

                    if(allowUpload)
                    {                        
                        loader.temporaryName = new Date().getTime() + "_"+ uuid.v4();
                        loader.data = data.request;
                    }                        
                    else
                        loader.temporaryName = undefined;
                    
                    sc.send("StartUploadResponse", {status: allowUpload, id: loader.id, key: loader.key, size: 0, response: response});                     
                });  
            }

            if(!loader)
            {
                loader = loaderFind(this.loaderArray, data.id, data.key)
                if(loader && loader.temporaryName)
                    reconnectedUp = true;     
                else// значить в первий раз
                {
                    reconnectedUp = false;
                    loader = createLoader();
                    this.loaderArray.push(loader);
                }
            }                

            if(!loader.temporaryName) 
                verifyRequest();
            else if(reconnectedUp)
            {              
                fs.stat(temporaryFilesPath + loader.temporaryName,(err, stats) =>
                {
                    if(err)
                        verifyRequest();
                    else
                        sc.send("StartUploadResponse", {status: true, id: loader.id, key: loader.key,  size: stats.size})
                });
            }
        });

        sc.on("Upload", (data) =>
        {
            if(!loader || !loader.temporaryName || !Buffer.isBuffer(data))
            {
                loader.temporaryName = undefined;
                return sc.send("UploadResponse", {status: false});
            }

           fs.appendFile(temporaryFilesPath + loader.temporaryName, data, "utf8", (err) => 
           {
                if(err)
                {
                    loader.temporaryName = undefined;
                    console.log(err)
                }

                sc.send("UploadResponse", {status: !err, byteLength: data.byteLength}) 
           });
        });

        sc.on("EndUpload", () => 
        { 
            if(!loader || !loader.temporaryName)
                return sc.send("EndUploadResponse", {status: false});

            fs.stat(temporaryFilesPath + loader.temporaryName,(err, stats) =>
            {
                if(err)
                {
                    loader.temporaryName = undefined;
                    return sc.send("EndUploadResponse", {status: false});
                }
                
                let functionUsed = false;
                this.EndUpload(loader.data, (allowWrite = false, filePath, response) => 
                { 
                    if(functionUsed)
                        return;
                    else
                        functionUsed = true
                    
                    if(allowWrite)
                    {   
                       fs.rename(temporaryFilesPath + loader.temporaryName, filesFolderPath + filePath, (err) =>
                       {
                            loader.temporaryName = undefined;
                            sc.send("EndUploadResponse", {status: !err, response: response});
                       });
                    }
                    else
                    {
                        fs.unlink(temporaryFilesPath + loader.temporaryName, err => {});
                        loader.temporaryName = undefined;
                        sc.send("EndUploadResponse", {status: false, response: response});
                    }
                });                
            });
        });

        sc.on("AbortUpload", () => 
        {
            if(!loader && !loader.temporaryName)
                return sc.send("AbortUploadResponse", {status: false })

            this.AbortUpload();
            fs.unlink(temporaryFilesPath + loader.temporaryName, err => { });
            loader.temporaryName = undefined
            sc.send("AbortUploadResponse", {status: true })
        });
    }
}

module.exports = FileLoaderServer;

/*

  function Utf8ArrayToStr(array) {
        var out, i, len, c;
        var char2, char3;

        out = "";
        len = array.length;
        i = 0;
        while(i < len) {
            c = array[i++];
            switch(c >> 4)
            {
                case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
                case 12: case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }

        return out;
    }
*/