export type TexHelpExample = {
    key: string;
    titleKey: string;
    descriptionKey: string;
    texKey: string;
};

export const TEX_HELP_SECTIONS: Array<{
    key: string;
    titleKey: string;
    descriptionKey: string;
    examples: TexHelpExample[];
}> = [
    {
        key: 'basicRules',
        titleKey: 'sections.basicRules.title',
        descriptionKey: 'sections.basicRules.description',
        examples: [
            {
                key: 'inlineFormula',
                titleKey: 'sections.basicRules.examples.inlineFormula.title',
                descriptionKey: 'sections.basicRules.examples.inlineFormula.description',
                texKey: 'sections.basicRules.examples.inlineFormula.tex',
            },
            {
                key: 'displayFormula',
                titleKey: 'sections.basicRules.examples.displayFormula.title',
                descriptionKey: 'sections.basicRules.examples.displayFormula.description',
                texKey: 'sections.basicRules.examples.displayFormula.tex',
            },
        ],
    },
    {
        key: 'commonSyntax',
        titleKey: 'sections.commonSyntax.title',
        descriptionKey: 'sections.commonSyntax.description',
        examples: [
            {
                key: 'fraction',
                titleKey: 'sections.commonSyntax.examples.fraction.title',
                descriptionKey: 'sections.commonSyntax.examples.fraction.description',
                texKey: 'sections.commonSyntax.examples.fraction.tex',
            },
            {
                key: 'powersSubscripts',
                titleKey: 'sections.commonSyntax.examples.powersSubscripts.title',
                descriptionKey: 'sections.commonSyntax.examples.powersSubscripts.description',
                texKey: 'sections.commonSyntax.examples.powersSubscripts.tex',
            },
            {
                key: 'squareRoot',
                titleKey: 'sections.commonSyntax.examples.squareRoot.title',
                descriptionKey: 'sections.commonSyntax.examples.squareRoot.description',
                texKey: 'sections.commonSyntax.examples.squareRoot.tex',
            },
        ],
    },
    {
        key: 'symbolsPatterns',
        titleKey: 'sections.symbolsPatterns.title',
        descriptionKey: 'sections.symbolsPatterns.description',
        examples: [
            {
                key: 'anglesGreek',
                titleKey: 'sections.symbolsPatterns.examples.anglesGreek.title',
                descriptionKey: 'sections.symbolsPatterns.examples.anglesGreek.description',
                texKey: 'sections.symbolsPatterns.examples.anglesGreek.tex',
            },
            {
                key: 'inequalityPlusMinus',
                titleKey: 'sections.symbolsPatterns.examples.inequalityPlusMinus.title',
                descriptionKey: 'sections.symbolsPatterns.examples.inequalityPlusMinus.description',
                texKey: 'sections.symbolsPatterns.examples.inequalityPlusMinus.tex',
            },
            {
                key: 'cases',
                titleKey: 'sections.symbolsPatterns.examples.cases.title',
                descriptionKey: 'sections.symbolsPatterns.examples.cases.description',
                texKey: 'sections.symbolsPatterns.examples.cases.tex',
            },
            {
                key: 'simultaneous',
                titleKey: 'sections.symbolsPatterns.examples.simultaneous.title',
                descriptionKey: 'sections.symbolsPatterns.examples.simultaneous.description',
                texKey: 'sections.symbolsPatterns.examples.simultaneous.tex',
            },
            {
                key: 'vector',
                titleKey: 'sections.symbolsPatterns.examples.vector.title',
                descriptionKey: 'sections.symbolsPatterns.examples.vector.description',
                texKey: 'sections.symbolsPatterns.examples.vector.tex',
            },
        ],
    },
    {
        key: 'sampleSet',
        titleKey: 'sections.sampleSet.title',
        descriptionKey: 'sections.sampleSet.description',
        examples: [
            {
                key: 'quadratic',
                titleKey: 'sections.sampleSet.examples.quadratic.title',
                descriptionKey: 'sections.sampleSet.examples.quadratic.description',
                texKey: 'sections.sampleSet.examples.quadratic.tex',
            },
            {
                key: 'proportion',
                titleKey: 'sections.sampleSet.examples.proportion.title',
                descriptionKey: 'sections.sampleSet.examples.proportion.description',
                texKey: 'sections.sampleSet.examples.proportion.tex',
            },
            {
                key: 'quadraticFormula',
                titleKey: 'sections.sampleSet.examples.quadraticFormula.title',
                descriptionKey: 'sections.sampleSet.examples.quadraticFormula.description',
                texKey: 'sections.sampleSet.examples.quadraticFormula.tex',
            },
        ],
    },
];
