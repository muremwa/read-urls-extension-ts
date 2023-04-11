const bracePairs = ['(', ')', '[', ']', '{', '}', '<', '>'];

export enum Braces {
    ROUND_BRACKET_OPEN,
    ROUND_BRACKET_CLOSE,
    SQUARE_BRACKET_OPEN,
    SQUARE_BRACKET_CLOSE,
    CURLY_BRACKET_OPEN,
    CURLY_BRACKET_CLOSE,
    ANGLE_BRACKET_OPEN,
    ANGLE_BRACKET_CLOSE
}

/**
 * Given a piece of text and a brace, split the into sections enclosed by the brace
 * Example
 *
 * text = "my name is Jane (the King) Doe. I am twenty(20) years old"
 * brace = '('
 *
 * returns = [ "(the king)", "(20)" ]
 *
 * if removeBrace is true, then returns = [ "the king", "20" ]
 * */
export function braceReader(text: string, openingBrace: Braces, removeBrace = false): Array<string> {
    if (openingBrace % 2 !== 0) {
        throw TypeError('Invalid opening brace')
    }

    const results: Array<string> = [];
    const subjectBraces = { open: bracePairs[openingBrace], close: bracePairs[openingBrace+1] };

    let incCount = 0;
    let homeIndex = 0;

    for (let index = 0; index < text.length; index++) {
        switch (text[index]) {
            case subjectBraces.close:
                incCount--;

                if (incCount === 0) {
                    const [ startIndex, stopIndex ] = removeBrace? [homeIndex + 1, index]: [homeIndex, index + 1];
                    results.push(text.substring(startIndex, stopIndex));
                    homeIndex = index + 1;
                    continue;
                }

                if (incCount < 0) {
                    throw TypeError('Text contains an invalid braces')
                }
                break;

            case subjectBraces.open:
                if (incCount === 0) {
                    homeIndex = index;
                }
                incCount++;
                break;

            default:
                break;
        }
    }

    return results;
}