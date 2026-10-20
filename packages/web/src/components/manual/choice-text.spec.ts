import { expect, it } from 'vitest';
import { simpleChoiceText, choiceTextHtml, choiceMaterialTitle } from './choice-text';

it('opens ordinary old answers in a plain field without losing line breaks or entities', () => {
  expect(simpleChoiceText('<p>A &amp; B</p><p>2 &lt; 3<br>next</p>')).toBe('A & B\n2 < 3\nnext');
  expect(simpleChoiceText('2')).toBe('2');
});
it('keeps images, formatting and unknown entities in the rich editor', () => {
  for (const html of ['<p><strong>Bold</strong></p>', '<img src="cove-asset:a" alt="diagram">', '<p style="color:red">Red</p>', '&copy;']) {
    expect(simpleChoiceText(html)).toBeNull();
  }
});
it('encodes literal code or HTML typed as an answer and round-trips its text', () => {
  const text = '<script> & "answer"\n1 < 2';
  const html = choiceTextHtml(text);
  expect(html).not.toContain('<script>');
  expect(simpleChoiceText(html)).toBe(text);
});
it('uses the question as the name unless the author supplies one', () => {
  expect(choiceMaterialTitle('', ' What is 1 + 1? ')).toBe('What is 1 + 1?');
  expect(choiceMaterialTitle('Saved name', 'New wording')).toBe('Saved name');
  expect(choiceMaterialTitle('', 'a'.repeat(200))).toHaveLength(128);
});
