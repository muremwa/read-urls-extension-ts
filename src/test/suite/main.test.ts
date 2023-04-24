import { ConfigReader } from "../../reader/main";
import { braceReader, Braces } from "../../reader/utilities";
import * as assert from 'assert';
import * as data from './main.test.json'
import { AppUrlConfigs, UrlArgument } from "../../reader/main.d";

class ConfigReaderPB extends ConfigReader {
    typePathConverterPB() {
        return this.typePathConverter.bind(this);
    }

    getGroupMatchPB() {
        return ConfigReaderPB.getGroupMatch;
    }

    cleanTextBeforeProcessingPB() {
        return ConfigReaderPB.cleanTextBeforeProcessing;
    }
}

suite('Main Test Suite', () => {
    const reader = new ConfigReaderPB();

    test('Test text processor', () => {
        const reader = new ConfigReaderPB();
        assert.strictEqual(
            "Muremwa Daniel",
            reader.cleanTextBeforeProcessingPB()('# My name is \nMuremwa\nDaniel')
        );
        assert.strictEqual(
            "Muremwa\nDaniel",
            reader.cleanTextBeforeProcessingPB()('# My name is \nMuremwa\nDaniel', true)
        );
    });

    test('Test Group Match', () => {
        const gp = reader.getGroupMatchPB();
        assert.strictEqual(
            'muremwa',
            gp('muremwa'.match(/(?<name>\w+)/), 'name')
        );
        assert.strictEqual(
            'fd',
            gp('muremwa'.match(/(?<name>\w+)/), 'names', 'fd')
        );
    });

    test('Test path converters', () => {
        const cov = reader.typePathConverterPB();
        const examples = [
            '<str:action>/', '<int:pk>/', '<uuid:ak_id>/', '/<song_id>/<slug:jn>/'
        ].map((ex) => cov(ex.match(/<.*?>/g)));

        const actualRes: Array<Array<UrlArgument>> = [
            [{ name: 'action', type: 'string' }],
            [{ name: 'pk', type: 'integer' }],
            [{ name: 'ak_id', type: 'UUID' }],
            [{ name: 'song_id', type: null }, { name: 'jn', type: 'slug' }]
        ];

        assert.deepStrictEqual(examples, actualRes);
    });

    test('Test Configs Finder', () => {
        const configs = reader.configsFinder(data.mapFile, 'example.py');
        assert.deepStrictEqual(['core'], Object.keys(configs));
        assert.deepStrictEqual(
            {
                core: [
                    "('accounts/<str:action>/', views.account_action, name='account-action')",
                    "('login/', views.login, name='login')",
                    "('profile/create/', views.profile_create, name='profile-create')",
                    "('profile/delete/<int:profile_pk>/', views.profile_delete, name='profile-delete')"
                ]
            },
            configs
        );
        const configs2 = reader.configsFinder(
            data.mapFile.replace(/app_name.*?['"].*?['"]/g, ''),
            'example/urls.py'
        );
        assert.deepStrictEqual(
            ['READER_FILE_PATH_example/urls.py'],
            Object.keys(configs2)
        );
    });

    test('Test Url Processor', () => {
        const configs: { [ appName: string ]: Array<string> } = {
            core: [
                "('accounts/<str:opt>/', views.account_action, name='action')",
                "('login/', views.login, name='login')"
            ],
            'READER_FILE_PATH_example/urls.py': [
                "('profile/delete/<int:pk>/', views.profile_delete, name='delete')"
            ]
        };
        const res: AppUrlConfigs = new Map([
            [
                'core',
                [
                    { name: 'action', args: [{ name: 'opt', type: 'string' }], hasArgs: true, viewName: 'core:action' },
                    { name: 'login', args: [], hasArgs: false, viewName: 'core:login' }
                ]
            ],
            [
                'READER_FILE_PATH_example/urls.py',
                [
                    { name: 'delete', args: [{ name: 'pk', type: 'integer' }], hasArgs: true, viewName: 'delete'}
                ]
            ]
        ]);

        assert.deepStrictEqual(reader.urlsProcessor(configs), res);
    });

    test('Test braces reader', () => {
        const samples: Array<[string, Braces]> = [
            ["my name is Jane (the King) Doe.\n I am twenty(20) years old", Braces.ROUND_BRACKET_OPEN],
            ["The president [Jomo] Kenyatta is dead. \n[78].", Braces.SQUARE_BRACKET_OPEN],
            ["Look at them {2}{3}", Braces.CURLY_BRACKET_OPEN],
            ["this is a <strong>Wild</strong> tag", Braces.ANGLE_BRACKET_OPEN]
        ];
        const res = [
            ['the King', '20'],
            ['Jomo', '78'],
            ['2', '3'],
            ['strong', '/strong']
        ];
        const res2 = [
            ['(the King)', '(20)'],
            ['[Jomo]', '[78]'],
            ['{2}', '{3}'],
            ['<strong>', '</strong>']
        ];

        assert.deepStrictEqual(
            samples.map(([sample, br]) => braceReader(sample, br)),
            res2
        );

        assert.deepStrictEqual(
            samples.map(([sample, br]) => braceReader(sample, br, true)),
            res
        );

        assert.throws(() => braceReader('}', Braces.CURLY_BRACKET_CLOSE), TypeError);

        assert.throws(() => braceReader('(sample)', Braces.CURLY_BRACKET_CLOSE), TypeError);
    });

    test('Test Models Finder', () => {
        data.models.forEach((txt, index) => {
            assert.deepStrictEqual(reader.modelsFinder(txt), data.modelsAns[index])
        });
    });
});
