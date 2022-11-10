const {getChaps} = require("./libs/lib")

getChaps("https://www.xyushu5.com/read/75123/").then(res => {
    console.log(res);
})
