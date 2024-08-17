module.exports = {
    apps: [
        {
            name: "Animon",
            script: "app.js",
            instances: 0,
            exec_mode: "cluster",
            exec_interpreter: "node",
        },
    ],
};
