const CopyIt = require("copy-webpack-plugin");
const path = require("path");

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
            patterns: [{ from: "./index.html" }],
        }),
    ],
};
