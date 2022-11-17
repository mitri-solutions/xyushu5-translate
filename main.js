const inquirer = require('inquirer')
const {getBooks, getChaps, translateChap, translateLongContent} = require('./libs/lib');
const XLSX = require('xlsx');
const fs = require("fs")
const {getCurrentDate, sleep} = require("./libs/until");
const {setupTranslate} = require("./libs/translate");
const {updateNewVersion} = require("./libs/update")
const _ = require("lodash")
const INPUT_DIR = './input';
const OUTPUT_DIR = './output';

console.log(`
__  ___   ___   _ ____  _   _ _   _ ____  
\\ \\/ \\ \\ / | | | / ___|| | | | | | | ___| 
 \\  / \\ V /| | | \\___ \\| |_| | | | |___ \\ 
 /  \\  | | | |_| |___) |  _  | |_| |___) |
/_/\\_\\ |_|  \\___/|____/|_| |_|\\___/|____/ 

         by jamesngdev (0971010421)
                (v1.3.3)
-----------------------------------------------
`)

if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR)
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR)
}

async function translateRetry(text, maxTryCount = 5, tryCountTimeout = 60 * 1000) {
    let tryCount = 0;
    while (tryCount < maxTryCount) {
        try {
            const translated = await translateLongContent(text);
            return translated;
        } catch (e) {
            console.log(`\t\t\t\t\t\tTranslate error: Try ${tryCount}/${maxTryCount} times <${e.message}>`);
            await sleep(tryCountTimeout);
        }
    }
    return Promise.reject('Can"t not reject')
}

async function translateResult() {
    const files = fs.readdirSync(INPUT_DIR);
    const {fileName} = await inquirer.prompt([{
        type: 'list',
        name: 'fileName',
        choices: files,
        message: "Select the file you want to translate: "
    }]);

    const file = XLSX.readFile(`${INPUT_DIR}/${fileName}`)
    const sheets = file.SheetNames[0];
    const books = XLSX.utils.sheet_to_json(
        file.Sheets[sheets]);
    let result = []

    let i = 0;
    for (const book of books) {
        console.log(`Translating ${i}/${books?.length}... \r`);
        i++;
        let tryCount = 0;
        while (tryCount < 5) {
            try {
                // const SPLITTER_CONTENT = '[[00]]';
                // const totalContent = [book?.name, book?.category, book?.intro].join(SPLITTER_CONTENT);
                // const translatedContent = await translateRetry(totalContent);
                // const [name, category, intro] = translatedContent.split(SPLITTER_CONTENT);
                const name = await translateRetry(book?.name);
                const category = await translateRetry(book?.category);
                const intro = await translateRetry(book?.intro);
                console.log(">>> Done")
                result.push({
                    bookId: book.bookId,
                    name: (name || "").trim(),
                    author: book.author,
                    category: (category || "").trim(),
                    intro: (intro || "").trim(),
                    url: book.url,
                    totalChap: book?.chappers?.length || 0,
                    translateFrom: book?.translateFrom,
                    translateTo: book?.translateTo,
                })
                break;
            } catch (e) {
                tryCount++;
                console.log(">>> Error <try>: ", e.message)
                await sleep(60 * 1000)
            }
        }
    }
    const ws = XLSX.utils.json_to_sheet(result)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Result')

    const {prefix} = await inquirer.prompt([{
        type: 'text',
        name: 'prefix',
        message: "File exist, please enter prefix: "
    }]);

    XLSX.writeFile(wb, `${OUTPUT_DIR}/${prefix}_${fileName}`)
    console.log("Translated >> " + `${OUTPUT_DIR}/${prefix}_${fileName}`)
}

const createPageUrl = (category, pageNumber) => {
    return `${category}/${pageNumber}/`;
}

const generateBookExcel = async () => {
    // Enter the link
    const {url} = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: "Enter category url: ",
        default: "https://www.xyushu5.com/sort3"
    }]);

    const {pagination, category} = await getBooks(createPageUrl(url, 1));
    const {paginations, totalPage} = pagination;

    console.log(">> Total page: " + totalPage)
    const {from, to} = await inquirer.prompt([{
        type: 'number',
        name: 'from',
        message: "From: "
    }, {
        type: 'number',
        name: 'to',
        message: "To: "
    }]);

    console.log(">>> Wait a moment...")

    const getBookOfPage = async (pageUrl) => {
        // const page = paginations?.find(page => page.label == pageNumber.toString());
        // if (!page?.href) {
        //     return [];
        // }
        const {items: books} = await getBooks(pageUrl);

        console.log("page", pageUrl);

        const _books = await Promise.all(books?.map(book => {
            return new Promise(async (resolve) => {
                const {chaps, intro} = await getChaps(book?.url)
                return resolve({
                    ...book,
                    chappers: chaps,
                    intro
                })
            })
        }));
        return _books?.reduce((rs, book) => {
            rs = [...rs, book]
            return rs;
        }, []);
    }

    let resultBooks = [];
    for (let i = from; i <= to; i++) {
        resultBooks.push(i);
    }

    const books = await Promise.all(resultBooks?.map((num) => getBookOfPage(createPageUrl(url, num))))

    // ID Truyện, Tên Truyện, Tên Tác Giả, Thể Loại, Tóm Tắt Truyện, Link, Chap dịch từ
    const excelData = books?.flat(1)?.map((item) => {
        return {
            bookId: item.bookId,
            name: item.name,
            author: item.author,
            category: category,
            intro: item.intro,
            url: item.url,
            totalChap: item?.chappers?.length || 0,
            translateFrom: "",
            translateTo: ""
        }
    });
    const {prefix} = await inquirer.prompt([{
        type: 'text',
        name: 'prefix',
        message: "File exist, please enter prefix: "
    }]);
    const excelName = `${prefix}_${category}_${from}_${to}_${getCurrentDate()}`
    // Save to excel
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Input')
    XLSX.writeFile(wb, `${INPUT_DIR}/${excelName}.xlsx`);
    console.log(`Exported: ${excelName}`);
}

const translateBooks = async () => {
    // result
    let errorChaps = []
    let totalCount = 0;
    let successCount = 0;

    const files = fs.readdirSync(INPUT_DIR);
    const {fileName} = await inquirer.prompt([{
        type: 'list',
        name: 'fileName',
        choices: files,
        message: "Select the file you want to translate: "
    }]);

    const file = XLSX.readFile(`${INPUT_DIR}/${fileName}`)
    const sheets = file.SheetNames[0];
    const books = XLSX.utils.sheet_to_json(
        file.Sheets[sheets]);

    console.log(`Detected ${books?.length} books`)
    const {from, to} = await inquirer.prompt([{
        type: 'number',
        name: 'from',
        message: "From book: "
    }, {
        type: 'number',
        name: 'to',
        message: "To book: "
    }]);

    for (let i = from; i <= to; i++) {
        const book = books[i - 1];
        const {translateFrom, translateTo, category} = book;
        if (!translateFrom || !translateTo) {
            continue;
        }

        console.log(`============${book.bookId}===========`)
        const {chaps} = await getChaps(book?.url).catch(err => {
            console.log('>> Error: Can"t get chaps')
            return []
        })

        for (let i = translateFrom; i <= translateTo; i++) {
            const chap = chaps.find(chap => chap.index === i);
            if (!chap) {
                console.log("Not find the chap")
                continue;
            }
            const target = {
                bookId: book?.bookId,
                chapId: chap?.url?.split('/')?.[3],
                chapUrl: chap.url,
                index: i,
                category
            }

            console.log(" => Start: ", target?.index)
            const MAX_TRY_TIME = 10;
            let TRY_TIME = 0;
            let success = false;
            while (TRY_TIME < MAX_TRY_TIME) {
                const translate = await translateChap(target, './result')
                if (translate.status) {
                    console.log("\t\t Success: " + translate.message)
                    success = true;
                    break;
                } else {
                    TRY_TIME++;
                    console.log("\t\t Error: " + translate.message)
                    if (translate.message === '404') {
                        console.log(target.chapUrl)
                        break;
                    }

                    await new Promise((resolve) => {
                        setTimeout(resolve, 30 * 1000);
                    });
                }
            }

            totalCount++;
            if (success) {
                successCount++;
            } else {
                errorChaps = [...errorChaps, target]
            }
        }
    }

    function showResultMessage() {
        const errorChapText = errorChaps.reduce((rs, chap) => {
            rs += `${chap.chapUrl}\t${chap.bookId}\t${chap.category}\n`
            return rs;
        }, `url                  \tbook   \tcategory\n`);

        console.log(`
        -----------ALL DONE ----------------
        Total: ${totalCount} 
        Error: ${errorChaps?.length}
        --------------------------
        ${errorChapText}
        ----------------------
            `)
    }

    showResultMessage();

    while (errorChaps?.length > 0) {
        const {translateAgain} = await inquirer.prompt([{
            type: 'confirm',
            name: 'translateAgain',
            message: "Would you want translate error chaps again?"
        }]);
        if (!translateAgain) {
            break;
        }

        const cloneErrorChaps = _.cloneDeep(errorChaps);
        for (let j = 0; j < cloneErrorChaps.length; j++) {
            const chapTarget = cloneErrorChaps[j];
            const MAX_TRY_TIME = 10;
            let TRY_TIME = 0;
            let success = false;
            while (TRY_TIME < MAX_TRY_TIME) {
                const translate = await translateChap(chapTarget, './result')
                if (translate.status) {
                    console.log("\t\t Success: " + translate.message)
                    success = true;
                    break;
                } else {
                    TRY_TIME++;
                    console.log("\t\t Error: " + translate.message)
                    if (translate.message === '404') {
                        console.log(chapTarget.chapUrl)
                        break;
                    }
                    await sleep(30 * 1000)
                }
            }
            if (success) {
                errorChaps = errorChaps.filter(target => target.bookId !== chapTarget.bookId)
            }
        }
        showResultMessage();
    }
}

const OPTIONS = {
    GET_BOOK: 'Get books',
    TRANSLATE: 'Translate book',
    TRANSLATE_INPUT: 'Translate input',
    UPDATE_NEW_VERSION: 'Update new version'
}

const start = async () => {
    const {method} = await inquirer.prompt([{
        type: 'list',
        name: 'method',
        choices: [OPTIONS.GET_BOOK, OPTIONS.TRANSLATE, OPTIONS.TRANSLATE_INPUT, OPTIONS.UPDATE_NEW_VERSION],
        message: "Select the function you want to use: "
    }]);
    switch (method) {
        case OPTIONS.GET_BOOK:
            await generateBookExcel();
            break;
        case OPTIONS.TRANSLATE:
            await setupTranslate();
            await translateBooks();
            break;
        case OPTIONS.TRANSLATE_INPUT:
            await setupTranslate();
            await translateResult();
            break;
        case OPTIONS.UPDATE_NEW_VERSION:
            await updateNewVersion();
            break;
    }

    await inquirer.prompt([{
        type: 'text',
        name: 'method',
        message: "DONE. Press Enter to exit "
    }]);
};
start()
