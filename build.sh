ncc build main.js -o dist
cd dist
pkg index.js --targets node16-win-x64 --debug
