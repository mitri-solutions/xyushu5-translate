const inquirer= require('inquirer')
const {getBooks, getChaps, translateChap, translateLongContent} = require('./lib');
const XLSX = require('xlsx');
const path = require("path");

const INPUT_FILE = './input.xlsx';

const startRun = async () => {
    const file = XLSX.readFile(INPUT_FILE)
    const sheets = file.SheetNames[0];
    const books= XLSX.utils.sheet_to_json(
        file.Sheets[sheets]);
    for (const book of books) {
        console.log(`============${book.bookId}===========`)
        const chaps = await getChaps(book?.url).catch(err => {
            console.log('>> Error: Can"t get chaps')
            return []
        })
        const {translateFrom, translateTo, category} = book;
        if (!translateFrom || !translateTo || !chaps) {
            console.log("Not found chap info")
            continue;
        }
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
            while (TRY_TIME < MAX_TRY_TIME) {
                const resultFolder = path.resolve(__dirname, './result');
                const translate = await translateChap(target, resultFolder)
                if (translate.status) {
                    console.log("\t\t Success: " + translate.message)
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
        }
    }
}

async function translateResult() {
    const file = XLSX.readFile(INPUT_FILE)
    const sheets = file.SheetNames[0];
    const books = XLSX.utils.sheet_to_json(
        file.Sheets[sheets]);
    let result = []
    for (const book of books) {
        const name = await translateLongContent(book?.name);
        const category = await translateLongContent(book?.category);
        const intro = await translateLongContent(book?.intro);
        result.push({
            ...book,
            name,
            category,
            intro
        })
    }
    const ws = XLSX.utils.json_to_sheet(result)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Result')
    XLSX.writeFile(wb, INPUT_FILE)
}


(async () => {
    // Enter the link
    const {url} = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: "Enter category url: ",
        default: "https://www.xyushu5.com/sort3/1/"
    }]);
    console.log(">>> Wait a moment...")

    const {pagination, category} = await getBooks(url);
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

    let resultBooks = [];
    for (let i = from; i <= to; i++) {
        const page = paginations?.find(page => page.label == i.toString());
        if (!page?.href) {
            continue;
        }
        const {items: books} = await getBooks(page.href);
        for (let j = 0; j < books.length; j++) {
            process.stdout.write(`Get ${j}/${books?.length} complete... \r`);
            const book = books[j];
            // @ts-ignore
            const chappers = await getChaps(book?.url);
            // @ts-ignore
            book.chappers = chappers;
        }
        resultBooks = [...books, ...resultBooks || []]
    }

    const excelData = resultBooks?.map((item) => {
        return {
            bookId: item.bookId,
            name: item.name,
            url: item.url,
            intro: item.intro,
            author: item.author,
            totalChap: item?.chappers?.length || 0,
            category: category,
            translateFrom: "",
            translateTo: ""
        }
    })

    // Save to excel
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Input')
    XLSX.writeFile(wb, INPUT_FILE)
    await inquirer.prompt([{
        type: 'boolean',
        name: 'from',
        message: ">>> Please enter the chap you want in file input.xlsx, then press Enter"
    }]);
    await startRun()

    const {isTranslate} = await inquirer.prompt([{
        type: 'confirm',
        name: 'isTranslate',
        message: "Do you want to translate input.xlsx file to VN?"
    }]);

    if (isTranslate) {
        try {
            console.log("Wait a moment...")
            await translateResult();
        } catch (e) {
            console.log("Translate Error. Please try again...")
        }
    }

    await inquirer.prompt([{
        type: 'confirm',
        name: 'done',
        message: "All done! Press Enter to exit"
    }]);
})()
