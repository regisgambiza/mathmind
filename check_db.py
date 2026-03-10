import sqlite3
conn = sqlite3.connect('C:/MyProjects/mathmind/server-python/mathmind.db')
print("Teachers:", conn.execute('SELECT * FROM teachers').fetchall())
print("Students:", conn.execute('SELECT * FROM students').fetchall())
