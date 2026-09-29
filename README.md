# lumiknit's Statis & Vanilla JS Web App Pages

This is for my github pages.

## Suntaek URL choices

Pass each option as a repeated `choice` parameter in the URL fragment, for example:

```text
/apps/suntaek/#/?choice=Pizza&choice=Sushi&choice=Tacos
```

After initialization, Suntaek fills the choice list and automatically picks one
result. Blank choices are ignored. Without any non-empty `choice` parameters,
the app starts normally. Reloading the URL makes a new pick.

Use `URLSearchParams` to encode choices containing special characters (such as
`&` or `+`):

```js
const params = new URLSearchParams();
['짜장면', '짬뽕', '2d6 + 3'].forEach((choice) =>
	params.append('choice', choice)
);
const url = `/apps/suntaek/#/?${params}`;
```

Fragment contents are handled in the browser and are not sent in the HTTP request.
Legacy URLs using `?choice=...` are still accepted.
