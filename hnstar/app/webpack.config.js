const CopyIt = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
    mode: process.env.NODE_ENV,
    entry: "./index.tsx",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                use: ["css-loader"],
            },
        ],
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, "dist"),
    },
    plugins: [
        new CopyIt({
            patterns: [
                { from: "./index.html" },
                { from: "./index.css" },
                { from: "./favicon48.png" },
                { from: "./favicon196.png" },
            ],
        }),
        new webpack.DefinePlugin({
            ENVIRONMENT: JSON.stringify(process.env.NODE_ENV),
            VERSION: JSON.stringify("1.0"),
        }),
    ],
};
