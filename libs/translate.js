const axios = require('axios');
const {v4: uuidv4} = require('uuid');
let translateKey;

const getKey = () => {
    return axios.get("https://raw.githubusercontent.com/mitri-solutions/xyushu5-translate/script/key.txt").then(res => {
        const keyNe = res.data.trim();
        translateKey = keyNe;
        return keyNe
    }).catch(() => {
        console.log("Can't get key from server. Please contact to Minh Tri (0971010421)")
    })
}

module.exports = async (text = '') => {
    let key = translateKey || await getKey();
    let endpoint = "https://api.cognitive.microsofttranslator.com";
    const texts = text.map(text => ({
        text
    }));

    let location = "southeastasia";
    const result = await axios({
        baseURL: endpoint,
        url: '/translate',
        method: 'post',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            // location required if you're using a multi-service or regional (not global) resource.
            'Ocp-Apim-Subscription-Region': location,
            'Content-type': 'application/json',
            'X-ClientTraceId': uuidv4().toString()
        },
        params: {
            'api-version': '3.0',
            'to': ['vi']
        },
        data: texts,
        responseType: 'json'
    }).then(res => res.data)
    return result.map(r => r?.translations?.[0]?.text).join("\n")
}
