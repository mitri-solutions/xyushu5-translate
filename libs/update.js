const axios = require("axios")
const fs = require("fs");

const updateNewVersion = async () => {
    console.log(">>> Updating...")
    const githubRawFile = `https://github.com/mitri-solutions/xyushu5-translate/blob/main/dist/index.js?raw=true`;

    const codeContent = await axios.get(githubRawFile, {responseType: 'arraybuffer'}).then(res => res.data);
    fs.writeFileSync('./index.js', codeContent);
    console.log(">> Done")
}


module.exports = {
    updateNewVersion
}
