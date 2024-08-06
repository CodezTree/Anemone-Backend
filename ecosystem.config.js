module.exports = {
    apps: [
        {
            name: "Animone",
            script: "app.js",
            instances: 0,
            exec_mode: "cluster",
            exec_interpreter: "node",
        },
    ],
};
