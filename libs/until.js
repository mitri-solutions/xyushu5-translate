const getCurrentDate = () => {
    const now = new Date()
    return `${now.getDate() > 10 ? now.getDate() : "0" + now.getDate()}${now.getMonth()}${now.getFullYear()}`
}

module.exports = {
    getCurrentDate
}
