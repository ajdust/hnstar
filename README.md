# hnstar

An alternative HackerNews viewer. In construction at https://hn.ajdust.dev. Features:

- Restrict date range
- Sort by time or score in a chosen date range
  - Presets for last 24 hours, 3 days, week and month
  - Paged results as a barrier to encourage discipline, not infinite scrolling
- Filter by the z-score of the score or minimum score to hide below average or average stories
- Dark and light styling


## data

Data is requested from the HackerNews official API (https://github.com/HackerNews/API) top stories endpoint every five minutes and merged into a PostgreSQL database. As such, it is not guaranteed to be up to date.


## future

Eventually I'd like to add sign in capabilities to allow hiding stories, star-rating stories, tagging and adding comments to stories. Much further down the line it would be an attempt to categorize or tag stories with machine learning.


