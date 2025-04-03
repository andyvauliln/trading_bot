import path from "path";

export const config = {
  db_name_tracker_tweets: path.resolve(process.cwd(), 'data', 'content.db'),
  bot_twitter: {
    tracker_timeout: 300000, // 5 min
    run_headless: false,
    launch_args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
      '--start-maximized',
      '--disable-notifications'
    ],
    accounts: [
      // {
      //   name: "Donald J. Trump",
      //   handle: "realDonaldTrump",
      // },
      {
        name: "ye",
        handle: "kanyewest",
      },
     
      // {
      //   name: "Elon Musk",
      //   handle: "elonmusk",
      // },
    ],
  },
};
