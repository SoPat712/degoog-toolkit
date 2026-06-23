export const command = {
  name: "4play CAPTCHA Helper",
  description: "Displays top-left notifications on the search page when the 4play (lolcat) transport hits a CAPTCHA.",
  trigger: "4playcaptcha",
  isClientExposed: false,
  execute() {
    return "The 4play CAPTCHA Helper is active. It will automatically alert you when a bot check is encountered.";
  }
};
