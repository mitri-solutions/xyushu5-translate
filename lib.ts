import axios from 'axios';
import cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';

export const getBooks = async (categoryUrl = '') => {
    const html = await axios.get(categoryUrl, {responseType: 'arraybuffer'}).then(res => res.data);
    const $ = cheerio.load(new TextDecoder('chinese').decode(html), {decodeEntities: false});
    const items = $('#alistbox').toArray().map((box: any) => {
        const linkElement = $(box).find('.title a');
        const author = $(box).find('.title span')?.text()?.replace('作者：', '')?.trim();
        const intro = $(box).find('.intro').text().trim();
        const url = linkElement.attr('href') || '';
        const bookId = new URL(url).pathname.replace('/read/', '').replace('/', '');
        return {
            url: linkElement.attr('href'),
            name: linkElement.text().trim().replace('《', '').replace('》', ''),
            bookId,
            intro,
            author
        };
    });

    const nextPageElement = $('#pagelink .next');
    const totalPageElement = $('#pagelink .last');
    const currentPageElement = $('#pagelink strong');

    const paginations = $('#pagelink').children().toArray().map((a: any) => {
        return {
            label: $(a).text(),
            href: $(a).attr('href')
        };
    });

    const category = $('#alist h3').text().trim().replace('小说最新列表', '').replace('List', '');

    return {
        items,
        category,
        pagination: {
            currentPage: Number(currentPageElement.text()),
            nextPage: nextPageElement?.attr('href'),
            totalPage: Number(totalPageElement.text().trim()),
            paginations
        }
    };
};

function getUniqueListBy(arr: any[], key: string) {
    return [...new Map(arr.map(item => [item[key], item])).values()];
}

export const getChaps = async (bookUrl: string) => {
    const html = await axios.get(bookUrl, {responseType: 'arraybuffer'}).then(res => res.data);
    const $ = cheerio.load(new TextDecoder('chinese').decode(html), {decodeEntities: false});
    const chapElements = $('#box dl').children();

    let readyToSaveChapElement = false;
    let result: any = [];
    for (const chapElement of chapElements) {
        // @ts-ignore
        if (!readyToSaveChapElement && chapElement.name === 'dt' && chapElement?.id === 'chapter_list') {
            readyToSaveChapElement = true;
            break;
        }
        const chapLinkElement = $(chapElement).find('a');
        let url = chapLinkElement.attr('href');
        if (url?.includes('javascript:Chapter')) {
            const [cid, aid] = url?.replace('javascript:Chapter(', '').replace(');', '').trim().split(',');
            url = `/read/${aid}/${cid}/`;
        }

        const title = chapLinkElement.text();
        const index = title.match(/\d/g)?.join("");

        if (url) {
            result = [...result, {
                url,
                title: chapLinkElement.text(),
                index: Number(index)
            }];
        }
    }

    return getUniqueListBy(result, 'url').sort((a: any, b: any) => a.index - b.index);
};


export const getChapContent = async (path: string) => {
    const url = 'https://www.xyushu5.com' + path;
    const html = await axios.get(url, {responseType: 'arraybuffer'}).then(res => res.data).catch(() => {
    })
    const $ = cheerio.load(new TextDecoder('chinese').decode(html), {decodeEntities: false});
    return $(`#main div[style="line-height: 30px;padding: 10px 50px;word-wrap: break-word;"]`).text().trim();
};


export const translate = async (text: string) => {
    const appId = '000000000A9F426B41914349A3EC94D7073FF941';
    const baseURL = 'https://api.microsofttranslator.com/v2/ajax.svc/TranslateArray';
    const randomRGP = (Math.random() + 1).toString(36).substring(7);

    const responseTexts = await axios.get(baseURL, {
        params: {
            appId,
            texts: JSON.stringify(text.split('\n')),
            to: 'vi',
            loc: 'en',
            ctr: null,
            ref: 'WidgetV3',
            rgp: randomRGP
        }
    }).then(res => res.data).catch(err => {
        throw new Error("Unknown error")
    })
    if (responseTexts?.includes('AppId is over the quota')) {
        throw new Error('Limited');
    }
    console.log(responseTexts)

    return (responseTexts || [])?.map((text: any) => text?.TranslatedText?.trim()).join('\n');
};

export const doTranslate = async (texts: any[], rgp: string) => {
    const appId = '000000000A9F426B41914349A3EC94D7073FF941';
    const baseURL = 'https://api.microsofttranslator.com/v2/ajax.svc/TranslateArray';

    const responseTexts = await axios.get(baseURL, {
        params: {
            appId,
            texts: JSON.stringify(texts),
            to: 'vi',
            loc: 'en',
            ctr: null,
            ref: 'WidgetV3',
            rgp
        }
    }).then(res => res.data).catch(err => {
        throw new Error("Unknown error")
    })
    if (responseTexts?.includes('AppId is over the quota')) {
        throw new Error('Limited');
    }

    return (responseTexts || [])?.map((text: any) => text?.TranslatedText?.trim()).join('\n');
};


export const translateLongContent = async (text: string) => {
    const sentences = text.split("\n");
    const SENTENCES_PER_REQUEST = 10;
    const randomRGP = (Math.random() + 1).toString(36).substring(7);
    let content = "";
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_REQUEST) {
        const currentText = [...sentences].splice(i, SENTENCES_PER_REQUEST);
        content += await doTranslate(currentText, randomRGP)
    }
    return content
}


// const chapTarget = {
//     'bookId': '74647',
//     'chapId': '26221745',
//     'chapUrl': '/read/74647/26221745/',
//     'index': 4
// };

interface ChapTargetInterface {
    bookId: string;
    chapId: string;
    chapUrl: string;
    index?: string | number;
}

export const translateChap = async (target: ChapTargetInterface, resultFolder: string) => {
    try {
        const FILE_NAME = 'chapter.txt';
        const {bookId, chapId, chapUrl, index} = target;
        const outputDirPath = path.join(resultFolder, `${bookId}/${bookId}_${chapId}_Chapter ${index}`);
        const saveFile = path.join(outputDirPath, FILE_NAME);
        if (fs.existsSync(saveFile)) {
            return {
                status: true,
                message: "Translated"
            }
        }

        const content = await getChapContent(chapUrl);
        if (content.trim() === '') {
            return {
                status: false,
                message: "404"
            }
        }
        const translatedContent = await translateLongContent(content);
        if (translatedContent) {
            if (!fs.existsSync(outputDirPath)) {
                fs.mkdirSync(outputDirPath, {recursive: true});
            }
            fs.writeFileSync(saveFile, translatedContent, 'utf-8');
            return {
                status: true,
                message: "Done"
            }
        } else {
            return {
                status: false,
                message: "Can't not translate"
            }
        }
    } catch (e: any) {
        return {
            status: false,
            message: e?.message || "Unkown"
        }
    }
};

// const fileContent = fs.readFileSync('./test.txt', 'utf-8');
// // translate(fileContent).then(res => {
// //     console.log(res)
// // })
//
// // translateChap(chapTarget);
//
//
// translateLongContent(fileContent)
//
// getBooks('https://www.xyushu5.com/sort1/1/').then(res => {
//     console.log(res)
// })
