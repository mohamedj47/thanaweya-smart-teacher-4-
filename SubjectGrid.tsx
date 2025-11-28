
import React from 'react';
import { Subject, GradeLevel } from '../types';
import { 
  BookOpen, 
  Calculator, 
  FlaskConical, 
  Globe, 
  Languages, 
  Microscope, 
  Atom, 
  Scale, 
  BrainCircuit,
  Activity,
  BookType,
  Dna,
  ScrollText,
  Flag
} from 'lucide-react';

interface SubjectGridProps {
  grade: GradeLevel;
  onSelect: (subject: Subject) => void;
}

const subjectIcons: Partial<Record<Subject, React.ReactNode>> = {
  [Subject.ARABIC]: <BookType className="w-10 h-10 text-emerald-600" />,
  [Subject.ENGLISH]: <Languages className="w-10 h-10 text-blue-600" />,
  [Subject.FRENCH]: <div className="font-black text-3xl text-indigo-600">Fr</div>,
  [Subject.GERMAN]: <div className="font-black text-3xl text-amber-600">De</div>,
  [Subject.INTEGRATED_SCIENCES]: <Dna className="w-10 h-10 text-teal-600" />,
  [Subject.PHYSICS]: <Atom className="w-10 h-10 text-violet-600" />,
  [Subject.CHEMISTRY]: <FlaskConical className="w-10 h-10 text-pink-600" />,
  [Subject.BIOLOGY]: <Microscope className="w-10 h-10 text-green-600" />,
  [Subject.MATH]: <Calculator className="w-10 h-10 text-red-600" />,
  [Subject.HISTORY]: <BookOpen className="w-10 h-10 text-amber-700" />,
  [Subject.GEOGRAPHY]: <Globe className="w-10 h-10 text-cyan-600" />,
  [Subject.PHILOSOPHY]: <Scale className="w-10 h-10 text-teal-700" />,
  [Subject.PSYCHOLOGY]: <BrainCircuit className="w-10 h-10 text-fuchsia-600" />,
  [Subject.GEOLOGY]: <Activity className="w-10 h-10 text-orange-600" />,
  [Subject.RELIGION]: <ScrollText className="w-10 h-10 text-emerald-800" />,
  [Subject.NATIONAL_EDUCATION]: <Flag className="w-10 h-10 text-red-800" />,
};

const SUBJECTS_BY_GRADE: Record<GradeLevel, Subject[]> = {
  [GradeLevel.GRADE_10]: [
    Subject.ARABIC,
    Subject.ENGLISH,
    Subject.MATH,
    Subject.INTEGRATED_SCIENCES,
    Subject.HISTORY,
    Subject.PHILOSOPHY,
    Subject.FRENCH,
    Subject.GERMAN,
    Subject.RELIGION,
    Subject.NATIONAL_EDUCATION
  ],
  [GradeLevel.GRADE_11]: [
    Subject.ARABIC,
    Subject.ENGLISH,
    Subject.MATH,
    Subject.PHYSICS,
    Subject.CHEMISTRY,
    Subject.BIOLOGY,
    Subject.HISTORY,
    Subject.GEOGRAPHY,
    Subject.PHILOSOPHY,
    Subject.PSYCHOLOGY,
    Subject.FRENCH,
    Subject.GERMAN
  ],
  [GradeLevel.GRADE_12]: [
    Subject.ARABIC,
    Subject.ENGLISH,
    Subject.MATH,
    Subject.PHYSICS,
    Subject.CHEMISTRY,
    Subject.BIOLOGY,
    Subject.GEOLOGY,
    Subject.HISTORY,
    Subject.GEOGRAPHY,
    Subject.PHILOSOPHY,
    Subject.PSYCHOLOGY,
    Subject.FRENCH,
    Subject.GERMAN
  ]
};

export const SubjectGrid: React.FC<SubjectGridProps> = ({ grade, onSelect }) => {
  const displayedSubjects = SUBJECTS_BY_GRADE[grade] || [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {displayedSubjects.map((subject) => (
        <button
          key={subject}
          onClick={() => onSelect(subject)}
          className="flex flex-row sm:flex-col items-center justify-start sm:justify-center p-5 sm:p-6 bg-white rounded-xl shadow-sm hover:shadow-md border border-slate-100 hover:border-indigo-200 transition-all duration-200 group"
        >
          <div className="mr-4 sm:mr-0 sm:mb-4 p-3 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors">
            {subjectIcons[subject]}
          </div>
          <span className="text-lg font-bold text-slate-800 text-center group-hover:text-indigo-700">
            {subject}
          </span>
        </button>
      ))}
    </div>
  );
};
