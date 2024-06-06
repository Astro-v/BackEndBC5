function checkCredentials(username, password) {
    return new Promise((resolve, reject) => {
        if (username === 'admin' && password === 'admin') {
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

module.exports = checkCredentials;