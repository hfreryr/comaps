import duckdb, json
files=[l.strip() for l in open('ov_files.txt') if l.strip()]
urls=','.join(f"'https://overturemaps-us-west-2.s3.amazonaws.com/{f}'" for f in files)
c=duckdb.connect(); c.sql("LOAD httpfs; LOAD spatial;")
rows=c.sql(f"""SELECT id, names.primary AS name, ST_Y(geometry) lat, ST_X(geometry) lon, websites, phones, socials, basic_category, operating_status, confidence
  FROM read_parquet([{urls}]) WHERE bbox.xmin BETWEEN 2.22 AND 2.475 AND bbox.ymin BETWEEN 48.81 AND 48.91""").fetchall()
cols=['id','name','lat','lon','websites','phones','socials','cat','status','conf']
json.dump([dict(zip(cols,r)) for r in rows],open('ov_paris.json','w'),default=str); print(len(rows))
