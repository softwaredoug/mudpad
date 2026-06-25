# Corrections management

Corrections largely provided by LanguageTool and LLM

General UI
- a side bar that shows current active issue
- an option to dismiss or apply the suggestion

## Applying the suggestion

Applying the suggestion will perform the suggested replacement

## Dismissing the suggestion

Dismissing the suggestion will ignore this one suggestion permanently for this document.

## Ignore frontmatter

Do not correct yaml frontmatter. It is not part of the document content and should be ignored for corrections.

## Ignore code blocks

Do not correct code blocks. They are not part of the document content and should be ignored for corrections.

## Ignore links

Links should be ignored / not corrected, IE

![image.png](/assets/media/2026/three-kinds-of-agentic-search/image.png)

or 

[foo bar](https://example.com)

The text in parenthesis should not be corrected, but the text in the brackets should be corrected.

### Spelling exceptions / always ignores

Keep a list in the active directory of teh spelling exceptions. This is a text file with one word per line. The words in this file will be ignored for spelling corrections.

That should only apply to the open directory


## Dismissed changes

Dismissed changes are dismissed exactly once and ideally not brought back again.

In the same folder as the spelling exceptions, keep a file called .dismissed-changes. This is a text file with one line per dismissed change.

The intention is to capture the dismissal and surrounding context. It's not a perfect way to do this, but it should be good enough for now.

Basically, when any change is "dismissed" we capture the several words before and after the change and store that in the .dismissed-changes file. If that same change is suggested again, we can check the surrounding context and if it matches, we can ignore it.

In addition, the file path of the document should be stored in the .dismissed-changes file so that we can ignore the same change in other documents in the same folder.

All in all, something like:

```
<file path> <change> <context before> <context after>
```

And the file should be sorted by <file path>

Here <file path> is an absolute path.

Be sure that the module that handles corrections can see the file path to be able to do this lookup
