export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"IBM Plex Sans\"", "sans-serif"]
      },
      colors: {
        ink: "#0E0F12",
        cream: "#F6F2EA",
        ocean: "#0E2A36",
        accent: "#C6A15B",
        mint: "#A7C7B7"
      },
      boxShadow: {
        soft: "0 20px 60px rgba(14,15,18,0.15)"
      }
    }
  },
  plugins: []
};
