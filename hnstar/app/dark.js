window.DARK_THEME = {
    url: "https://stackpath.bootstrapcdn.com/bootswatch/4.5.2/cyborg/bootstrap.min.css",
    integrity: "sha384-nEnU7Ae+3lD52AK+RGNzgieBWMnEfgTbRHIwEvp1XXPdqdO6uLTd/NwXbzboqjc2",
    enable: () => {
        const el = document.getElementById("dark-bootstrap-stylesheet");
        el.setAttribute("href", DARK_THEME.url);
        el.setAttribute("integrity", DARK_THEME.integrity);
        const also = document.getElementById("dark-stylesheet");
        also.setAttribute("href", "./dark.css");
    },
    disable: () => {
        const el = document.getElementById("dark-bootstrap-stylesheet");
        el.setAttribute("href", "");
        el.setAttribute("integrity", "");
        const also = document.getElementById("dark-stylesheet");
        also.setAttribute("href", "");
    },
};
