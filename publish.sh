#!/bin/bash

npm run test | grep 'fail' &> /dev/null

if [$? == 0]; then
    vsce package
    sed -e 's/"publisher": "kreativ-software"/"publisher": "jsw"/g' ./package.json >./package.json.temp
    mv package.json package.json.2.temp
    mv package.json.temp package.json
    ovsx publish -p $(cat ovsx.key)
    rm package.json
    mv package.json.2.temp package.json
else
    echo 'Test failed, cannot publish'
fi
