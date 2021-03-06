import sqlite3
import json
# create sqlite db
conn = sqlite3.connect('repos.db')
c = conn.cursor()
# create table if not exists
# table name: repos
# fields: repo name, url, stars
# primary key repo_name
c.execute('''CREATE TABLE IF NOT EXISTS repo
                (repo_name text primary key, url text, branch text, stars integer)''')
c.execute('''delete from repo''')
results = json.loads(open('repos.json').read())
for (repo_name, url, branch, stars) in results:    
    c.execute("INSERT OR REPLACE INTO repo VALUES (?, ?, ?, ?)", (repo_name, url, branch, stars))
conn.commit()