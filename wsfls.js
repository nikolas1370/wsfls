const socket = require("wscs") 
const fs = require("fs")
const uuid = require("uuid");

const packetSize = 128 * 1024
let FileLoader;
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
        FFile.baseFolder = filesFolderPath
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

class FFile
{
    #id
    #fd // fileDescriptor
    #size
    #opens
    #waitingReadList
    #amountData
    constructor(header)
    {
        this.header = header;
        this.#id =  new Date().getTime() + "_" + uuid.v4();
        this.#opens = false;
        this.#waitingReadList = []
        this.#amountData = 0;
        this.lox = ""
        this.loxN = 0
        this.loxN2 = 0
    }

    static baseFolder = ""

    get id() 
    {
        return this.#id;
    }
    get amountData()
    {
        return this.#amountData;
    }

    get size()
    {
        return this.#size;
    }

    open(filePath, callbackOpen, callbackErrar)
    {
        this.#opens = true;
        filePath = FFile.baseFolder + filePath
        fs.stat(filePath,  (err, stat) =>
        {          
            if(err)
            {
                this.#opens = false;
                return callbackErrar(err)
            }

            this.#size = stat.size;                 
            fs.open(filePath, 'r', (_err, fd) => 
            {
                if(_err)
                {
                    this.#opens = false;
                    return callbackErrar(_err)
                }

                this.#fd = fd;      
                this.#opens = false;
                callbackOpen();
                
                for (let i = 0; i < this.#waitingReadList.length; i++) 
                    this.read(this.#waitingReadList[i].start, this.#waitingReadList[i].length, this.#waitingReadList[i].callback)

                this.#waitingReadList.length = 0;
            })
        })       
    }

    /**
     * 
     * @param {*} start 
     * @param {*} length 
     * @param {*} callback  callback(undefined)  помилка
     * @returns 
     */
    read(start, length, callback)
    {
        if(!this.#fd)
        {
            if(this.#opens)
                return this.#waitingReadList.push({start, length, callback})
            else
                return callback();
        }

        let buffer = Buffer.alloc(length);
        fs.read(this.#fd, buffer, 0, length, start, (err, bytesRead, buf) =>
        {                            
            if(err)
                callback(undefined);
            else
                callback(bytesRead !== length ? buf.slice(0, bytesRead) : buf)                
        });
    }

    findFile(fileName, callback)
    {
        this.#id = fileName;
        fs.stat(temporaryFilesPath + this.#id,  (err, stat) => 
        {
            this.#amountData = (err ? 0 : stat.size);
            callback(this.#amountData)
        })
    }

    appendFile(data, callback = () => {})
    {       
        fs.appendFile(temporaryFilesPath + this.#id, data, "utf8", (err) => 
        {   
            if(err)    
                return callback();

            fs.stat(temporaryFilesPath + this.#id,  (err, stat) => 
            {                
                this.#amountData = (err ? undefined : stat.size);
                callback(this.#amountData)
            });
        });                              
    }

    checkFile(callback)
    {
        fs.stat(temporaryFilesPath + this.#id,  (err, stat) => callback(!!stat))
    }
    saveFile(path, callback)
    {
        fs.rename(temporaryFilesPath + this.#id, filesFolderPath + path, err => {return callback(!err)});
    }

    deleteTemporary()
    {
        fs.unlink(temporaryFilesPath + this.#id, err => {console.log("deleteTemporary fail", err)});
    }

    close()
    {
        if(this.fs)
        {
            fs.close(this.#fd, () => {})
            this.#fd = undefined
        }
    }
}

class Upload// ненравиться це перепиши колись )// цей комент ту прописаний
{
    constructor()
    {
        this.StartUpload = (data, fun) => {fun(false)}
        this.EndUpload = (data, fun) => {fun(false)}
        this.AbortUpload = (header) => {}
        this.globalFileList = []
    }

    newSocket(sc)
    {
        let currentFile;
        let fileList = []; // FFile

        sc.on("StartUpload", (data = {}) =>  
        {            
            if(data.id)
            {
                currentFile = this.globalFileList[data.id]
                if(!currentFile)
                    return sc.send("StartUploadResponse", {status: false});

                return sc.send("StartUploadResponse", {status: true, id: currentFile.id,  amountData: currentFile.amountData});
            }

            currentFile = undefined;            
            let functionUsed = false; 
            this.StartUpload(data.header, (allowUpload = false, response = {}) =>
            {                
                if(functionUsed)
                    return;
                else
                    functionUsed = true;

                if(allowUpload)
                {                                  
                    let file = new FFile(data.header)
                    this.globalFileList[file.id] = file;
                    fileList.push(file.id)
                    currentFile = file
                    if(data.id)
                        file.findFile(data.id , (amountData) => sc.send("StartUploadResponse", {status: true, id: file.id, amountData, response: response}));
                    else
                        sc.send("StartUploadResponse", {status: true, id: file.id,  amountData: 0, response: response});                                          
                }                        
                else
                    sc.send("StartUploadResponse", {status: false});                                                   
            });              
        });

        sc.on("Upload", (data, hea) =>
        {            
            if(!currentFile || !Buffer.isBuffer(data))
                return sc.send("UploadResponse", {status: false});
         
            if(currentFile.amountData  !== hea.amountData)
                return  sc.send("UploadResponse", {status: true, id: currentFile.id, amountData : currentFile.amountData});

            let currentFile_ = currentFile
            currentFile.appendFile(data, (amountData) => 
            {                
                if(typeof(amountData) === "number")
                    sc.send("UploadResponse", {status: true, id: currentFile_.id, amountData});
                else
                    sc.send("UploadResponse", {status: false});
            })           
        });

        sc.on("EndUpload", (id) => 
        {
            if(currentFile.id !== id)   
                return sc.send("EndUploadResponse", {status: false, id: currentFile_.id});
 
            let currentFile_ = currentFile;
            currentFile = undefined;
            currentFile_.checkFile((status) =>
            {
                if(status)
                {
                    let functionUsed = false;
                    this.EndUpload(currentFile_.header, (allowWrite = false, filePath, response) => 
                    { 
                        if(functionUsed)
                            return;
                        else
                            functionUsed = true
                        
                        for (let i = 0; i < fileList.length; i++) 
                        {
                            if(fileList[i] === currentFile_.id)
                            {
                                fileList[i].splice(i, 1);
                                this.globalFileList[currentFile_.id] = undefined
                                break
                            }
                            
                        }

                        if(allowWrite)
                        {
                            currentFile_.saveFile(filePath, status => 
                            {
                                if(status) 
                                    sc.send("EndUploadResponse", {status: true,  response, id: currentFile_.id});
                                else
                                    sc.send("EndUploadResponse", {status: false, id: currentFile_.id});
                            })
                        }
                        else
                        {
                            currentFile_.deleteTemporary();                          
                            sc.send("EndUploadResponse", {status: false, notallowed: true, response, id: currentFile_.id});
                        }
                    });      
                }
                else
                    return sc.send("EndUploadResponse", {status: false, id: currentFile_.id});
            })                
        });

        sc.on("AbortUpload", (id) => 
        {// видалить в лобалкі
            for (let i = 0; i < fileList.length; i++) 
            {
                if(fileList[i].id === id)
                {
                    var file = fileList.splice(i, 1)[0]
                    this.globalFileList[file.id] = undefined;
                    break;
                }                
            }

            if(!file)
                return;

            file.deleteTemporary();    
            this.AbortUpload(file.header);            
            if(currentFile.id === id)
                currentFile = undefined;            
        });
    }
}

class Download
{
    constructor()
    {
        this.StartDownload = (data, fun) => {fun(false) }        
        this.EndDownload = () => {}
        this.AbortDownload = () => {}
    }

    newSocket(sc)
    {
        let currentFile;
        let fileList = []; // FFile

        sc.setEventClose(() => 
        {
            currentFile = undefined;
            for (let i = 0; i < fileList.length; i++) 
                fileList[i].close();

            fileList.length = 0;
        });
        sc.on("StartDownload", (data) => 
        {
            currentFile = undefined;
            if(data.id)
            {                
                for (let i = 0; i < fileList.length; i++) 
                {
                    if(fileList[i].id === data.id)// підчас цього зєднання цей файл починав завантаження но був призупинений чи приорітет понижений
                    {                        
                        currentFile = fileList[i];
                        return  sc.send("StartDownloadResponse", {status: true, totalSize: currentFile.size, id: currentFile.id})
                    }                
                }
            }
            
            let functionUsed = false;                
            this.StartDownload(data.header, (allowDownload = false,  filePath, response) =>
            {
                if(functionUsed)
                    return;
                else
                    functionUsed = true;
                    
                if(allowDownload)
                {                 
                    currentFile = new FFile(data.header);
                    fileList.push(currentFile);
                    return currentFile.open(filePath, () => sc.send("StartDownloadResponse", {status: true, totalSize: currentFile.size, response: response, id: currentFile.id}), () => {sc.send("StartDownloadResponse", {status: false, notallowed: false, openError : true})})
                }
  
                sc.send("StartDownloadResponse", {status: false, response: response, notallowed: true})
            });  
        })
        
        sc.on("Download", (data) =>
        {
            if(!currentFile || currentFile.id !== data.id)
                return sc.send("DownloadResponse", {status : false})
  
            let currentFile_ = currentFile;
            currentFile_.read(data.amountData, packetSize, (buf) =>
            {
                if(!currentFile || currentFile.id !== currentFile_.id)
                    return  sc.send("DownloadResponse", undefined);
                                    
                if(!buf)
                {
                    sc.send("DownloadResponse", undefined);
                    currentFile_.close();
                    let index = fileList.indexOf(currentFile_);
                    fileList.splice(index, index === -1? 0 : 1);
                    currentFile = undefined;                    
                }
                else 
                {
                    let end = buf.length < packetSize
                    sc.send("DownloadResponse", buf, {end: end, response: end ? this.EndDownload(currentFile_.header) : undefined, id: currentFile_.id})
                    if(end)
                    {
                        currentFile_.close()
                        let index = fileList.indexOf(currentFile_);
                        fileList.splice(index, index === -1? 0 : 1);
                        currentFile = undefined
                    }
                }
            })
        } );        

        sc.on("AbortDownload", (id) =>
        {
            for (let i = 0; i < fileList.length; i++) 
            {
                if(fileList[i].id === id)
                {
                    if(currentFile && currentFile.id === id)
                        currentFile = undefined;

                    this.AbortDownload(fileList[i].header); 
                    fileList[i].close();
                    return fileList.splice(i, 1);
                }                
            }            
        });        
    }
}

module.exports = FileLoaderServer;