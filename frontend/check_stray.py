content = open('src/app/analytics/heatmap/page.tsx', encoding='utf-8').read()
idx = content.find('return (\n    <div')
if idx != -1:
    print(repr(content[idx-10:idx+20]))
else:
    print("Not found")
