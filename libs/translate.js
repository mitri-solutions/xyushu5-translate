const axios = require('axios');
const {v4: uuidv4} = require('uuid');
const fs = require("fs");
const inquirer = require("inquirer");
let defaultMethod;
let defaultLang;

const doTranslate = async (texts, rgp) => {
    const appId = '000000000A9F426B41914349A3EC94D7073FF941';
    const baseURL =
        'https://api.microsofttranslator.com/v2/ajax.svc/TranslateArray';

    const responseTexts = await axios
        .get(baseURL, {
            params: {
                appId,
                texts: JSON.stringify(texts),
                to: defaultLang,
                loc: 'en',
                ctr: null,
                ref: 'WidgetV3',
                rgp,
            },
        })
        .then((res) => res.data)
        .catch(() => {
            throw new Error('Unknown error');
        });
    if (responseTexts?.includes('AppId is over the quota')) {
        throw new Error('Limited');
    }

    return (responseTexts || [])
        ?.map((text) => text?.TranslatedText?.trim())
        .join('\n');
};

const mateTranslate = async (sentences) => {
    const SENTENCES_PER_REQUEST = 10;
    const randomRGP = (Math.random() + 1).toString(36).substring(7);
    let content = '';
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_REQUEST) {
        const currentText = [...sentences].splice(i, SENTENCES_PER_REQUEST);
        content += await doTranslate(currentText, randomRGP);
    }
    return content;
};


const microsoftTranslate = async (text = []) => {
    const [key, location] = fs.readFileSync('./key.txt', 'utf8').split("|")
    let endpoint = "https://api.cognitive.microsofttranslator.com";
    const texts = text.map(text => ({
        text
    }));

    const result = await axios({
        baseURL: endpoint,
        url: '/translate',
        method: 'post',
        headers: {
            'Ocp-Apim-Subscription-Key': key.trim(),
            // location required if you're using a multi-service or regional (not global) resource.
            'Ocp-Apim-Subscription-Region': location.trim(),
            'Content-type': 'application/json',
            'X-ClientTraceId': uuidv4().toString()
        },
        params: {
            'api-version': '3.0',
            'to': [defaultLang]
        },
        data: texts,
        responseType: 'json'
    }).then(res => res.data)
    return result.map(r => r?.translations?.[0]?.text?.trim()).join("\n")
}

const TRANSLATE_METHOD = {
    MATE: 'Mate Translate',
    MICROSOFT: 'Microsoft'
}

module.exports = async (texts = []) => {
    let translateMethod;
    let lang;
    if (defaultMethod) {
        translateMethod = defaultMethod;
    } else {
        const {translate} = await inquirer.prompt([{
            type: 'list',
            name: 'translate',
            choices: [TRANSLATE_METHOD.MATE, TRANSLATE_METHOD.MICROSOFT],
            message: "Select translate method: "
        }]);
        translateMethod = translate
        defaultMethod = translate
    }

    if (!defaultLang) {
        const {selectedLang} = await inquirer.prompt([{
            type: 'text',
            name: 'selectedLang',
            message: "Translate to (vi: Vietnam, en: English) "
        }]);
        defaultLang = selectedLang
    }

    if (translateMethod === TRANSLATE_METHOD.MATE) {
        return mateTranslate(texts);
    } else {
        return microsoftTranslate(texts)
    }
}
