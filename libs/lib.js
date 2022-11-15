const axios = require('axios');
const cheerio = require('cheerio')
const path = require("path");
const fs = require("fs");
const gpk = require("gbk")
const {translate} = require("./translate");
const _ = require('lodash');

const getBooks = async (categoryUrl = '') => {
    const html = await axios
        .get(categoryUrl, {responseType: 'arraybuffer'})
        .then((res) => res.data);
    const $ = cheerio.load(gpk.toString('utf-8', html), {
        decodeEntities: false,
    });
    const items = $('#alistbox')
        .toArray()
        .map((box) => {
            const linkElement = $(box).find('.title a');
            const author = $(box)
                .find('.title span')
                ?.text()
                ?.replace('作者：', '')
                ?.trim();
            const intro = $(box).find('.intro').text().trim();
            const url = linkElement.attr('href') || '';
            const bookId = new URL(url).pathname
                .replace('/read/', '')
                .replace('/', '');
            return {
                url: linkElement.attr('href'),
                name: linkElement.text().trim().replace('《', '').replace('》', ''),
                bookId,
                intro,
                author,
            };
        });

    const nextPageElement = $('#pagelink .next');
    const totalPageElement = $('#pagelink .last');
    const currentPageElement = $('#pagelink strong');

    const paginations = $('#pagelink')
        .children()
        .toArray()
        .map((a) => {
            return {
                label: $(a).text(),
                href: $(a).attr('href'),
            };
        });

    const category = $('#alist h3')
        .text()
        .trim()
        .replace('小说最新列表', '')
        .replace('List', '');

    return {
        items,
        category,
        pagination: {
            currentPage: Number(currentPageElement.text()),
            nextPage: nextPageElement?.attr('href'),
            totalPage: Number(totalPageElement.text().trim()),
            paginations,
        },
    };
};


const getChaps = async (bookUrl) => {
    const html = await axios
        .get(bookUrl, {responseType: 'arraybuffer'})
        .then((res) => res.data);
    const $ = cheerio.load(gpk.toString('utf-8', html), {
        decodeEntities: false,
    });
    // @ts-ignore
    const chapElements = $('#box dl').children();

    let readyToSaveChapElement = false;
    let chaps = [];
    for (const chapElement of chapElements) {
        if (
            !readyToSaveChapElement &&
            chapElement.name === 'dt' &&
            $(chapElement).attr('id') === 'chapter_list'
        ) {
            readyToSaveChapElement = true;
            continue;
        }

        if (!readyToSaveChapElement) {
            continue;
        }
        if ($(chapElement).attr('class') !== 'chapter_list') {
            continue;
        }

        const chapLinkElement = $(chapElement).find('a');
        let url = chapLinkElement.attr('href');
        if (url?.includes('javascript:Chapter')) {
            const [cid, aid] = url
                ?.replace('javascript:Chapter(', '')
                .replace(');', '')
                .trim()
                .split(',');
            url = `/read/${aid}/${cid}/`;
        }

        const title = chapLinkElement.text().trim()

        if (url) {
            chaps = [
                ...chaps,
                {
                    url,
                    title
                },
            ];
        }
    }


    const sortedChaps = _.chunk(chaps, 3).map(chunk => chunk.reverse()).flat(2);
    const _chaps =  sortedChaps.map((chap, index) => ({...chap, index: index + 1}));
    const intro = $('#aboutbook').text().trim();

    return {
        chaps: _chaps,
        intro
    }
};

const getChapContent = async (path) => {
    const url = 'https://www.xyushu5.com' + path;
    const html = await axios
        .get(url, {responseType: 'arraybuffer'})
        .then((res) => res.data)
        .catch(() => {
        });
    const $ = cheerio.load(gpk.toString('utf-8', html), {
        decodeEntities: false,
    });
    return $(
        `#main div[style="line-height: 30px;padding: 10px 50px;word-wrap: break-word;"]`,
    )
        .text()
        .trim().replace("- 新御书屋  https://www.xyushu5.com", "");
};

const translateLongContent = async (text) => {
    const sentences = text.split('\n');
    const SENTENCES_PER_REQUEST = 10;
    let content = '';
    for (let i = 0; i < sentences.length; i += SENTENCES_PER_REQUEST) {
        const currentText = [...sentences].splice(i, SENTENCES_PER_REQUEST);
        content += await translate(currentText);
    }
    return content;
};

const translateChap = async (
    target,
    resultFolder,
) => {
    try {
        const FILE_NAME = 'chapter.txt';
        const {bookId, chapId, chapUrl, index, category} = target;
        const outputDirPath = path.join(
            resultFolder,
            `${category}/${bookId}/${bookId}_${chapId}_Chapter ${index}`,
        );
        const saveFile = path.join(outputDirPath, FILE_NAME);
        if (fs.existsSync(saveFile)) {
            return {
                status: true,
                message: 'Translated',
            };
        }

        const content = await getChapContent(chapUrl);
        if (content.trim() === '') {
            return {
                status: false,
                message: '404',
            };
        }
        const translatedContent = await translateLongContent(content);
        if (translatedContent) {
            if (!fs.existsSync(outputDirPath)) {
                fs.mkdirSync(outputDirPath, {recursive: true});
            }
            // Remove content
            const contentRemove = `- Nhà sách Tân Ngự https://www.xyushu5.com`;
            fs.writeFileSync(saveFile, translatedContent.replace(contentRemove, ''), 'utf-8');
            return {
                status: true,
                message: 'Done',
            };
        } else {
            return {
                status: false,
                message: "Can't not translate",
            };
        }
    } catch (e) {
        return {
            status: false,
            message: e?.message || 'Unkown',
        };
    }
};

module.exports = {
    getBooks,
    getChaps,
    getChapContent,
    translateChap,
    translateLongContent
}
