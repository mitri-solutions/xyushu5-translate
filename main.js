const inquirer = require('inquirer')
const {getBooks, getChaps, translateChap, translateLongContent} = require('./libs/lib');
const XLSX = require('xlsx');
const fs = require("fs")
const {getCurrentDate, sleep} = require("./libs/until");
const {setupTranslate} = require("./libs/translate");

const INPUT_DIR = './input';
const OUTPUT_DIR = './output';

console.log(`
__  ___   ___   _ ____  _   _ _   _ ____  
\\ \\/ \\ \\ / | | | / ___|| | | | | | | ___| 
 \\  / \\ V /| | | \\___ \\| |_| | | | |___ \\ 
 /  \\  | | | |_| |___) |  _  | |_| |___) |
/_/\\_\\ |_|  \\___/|____/|_| |_|\\___/|____/ 

         by jamesngdev (0971010421)
-----------------------------------------------
`)

if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR)
}

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR)
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
        process.stdout.write(`Translating... ${i}/${books?.length}... \r`);
        i++;
        let tryCount = 0;
        let isSuccess = false;
        while (tryCount < 5) {
            try {
                const name = await translateLongContent(book?.name);
                const category = await translateLongContent(book?.category);
                const intro = await translateLongContent(book?.intro);
                result.push({
                    bookId: book.bookId,
                    name,
                    author: book.author,
                    category,
                    intro,
                    url: book.url,
                    totalChap: book?.chappers?.length || 0,
                    translateFrom: book?.translateFrom,
                    translateTo: book?.translateTo,
                })
                break;
            } catch (e) {
                tryCount++;
                await sleep(10 * 1000)
            }
        }
        if (!isSuccess) {
            result.push(book)
        }
    }
    const ws = XLSX.utils.json_to_sheet(result)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Result')
    XLSX.writeFile(wb, `${OUTPUT_DIR}/${fileName}`)
    console.log("Translated >> " + fileName)
}


const generateBookExcel = async () => {
    // Enter the link
    const {url} = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: "Enter category url: ",
        default: "https://www.xyushu5.com/sort3/1/"
    }]);

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

    const getBookOfPage = async (pageNumber) => {
        const page = paginations?.find(page => page.label == pageNumber.toString());
        if (!page?.href) {
            return [];
        }
        const {items: books} = await getBooks(page.href);

        const _books = await Promise.all(books?.map(book => {
            return new Promise(async (resolve) => {
                const chaps = await getChaps(book?.url)
                return resolve({
                    ...book,
                    chappers: chaps
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

    const books = await Promise.all(resultBooks?.map((num) => getBookOfPage(num)))

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
    const excelName = `${category}_${from}_${to}_${getCurrentDate()}`
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
    for (const book of books) {
        const {translateFrom, translateTo, category} = book;
        if (!translateFrom || !translateTo) {
            continue;
        }

        console.log(`============${book.bookId}===========`)
        const chaps = await getChaps(book?.url).catch(err => {
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

    // Tổng số chap đã dịch được
    // Tổng số chap lỗi
    // Liệt kê chap lỗi (bao gồm các thông tin như: đường link chap, chap thuộc thư mục truyện nào, thuộc thư mục chap nào của truyện đó

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

const OPTIONS = {
    GET_BOOK: 'Get books',
    TRANSLATE: 'Translate book',
    TRANSLATE_INPUT: 'Translate input'
}

const start = async () => {
    const {method} = await inquirer.prompt([{
        type: 'list',
        name: 'method',
        choices: [OPTIONS.GET_BOOK, OPTIONS.TRANSLATE, OPTIONS.TRANSLATE_INPUT],
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
    }

    await inquirer.prompt([{
        type: 'text',
        name: 'method',
        message: "DONE. Press Enter to exit "
    }]);
};
start()
