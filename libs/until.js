const getCurrentDate = () => {
    const now = new Date()
    return `${now.getDate() > 10 ? now.getDate() : "0" + now.getDate()}${now.getMonth()}${now.getFullYear()}`
}
const sleep = (time) => {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

module.exports = {
    getCurrentDate,
    sleep
}
